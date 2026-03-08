# FreeCord Architecture

A centralized, cross-platform real-time chat application built with Clean Architecture.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Monorepo** | `/backend`, `/voice-service`, `/client` |
| **Backend** | .NET 8 Minimal APIs, Entity Framework Core (Code-First), PostgreSQL, Redis, SignalR |
| **Voice** | Node.js (TypeScript), Mediasoup (WebRTC), gRPC |
| **Client** | Tauri + Angular |
| **Deployment** | Docker Compose |

## Backend Structure (Clean Architecture)

```
backend/
├── ChatApp.Api          # HTTP API, endpoints, JWT auth, SignalR mapping
├── ChatApp.Core         # Entities, services (IPresenceService), repositories (IMessageRepository)
├── ChatApp.Data         # EF Core DbContext, migrations, Dapper repositories
├── ChatApp.Infra        # Redis, presence management
└── ChatApp.Realtime     # SignalR ChatHub
```

### ChatApp.Api

- Minimal API with JWT authentication
- Auth endpoints: `/api/auth/register`, `/api/auth/login`
- User endpoints (require JWT):
  - `GET /api/users/me` – current user profile (id, username, customThemeCss)
  - `PUT /api/users/me/theme` – update CustomThemeCss (max 64KB)
- Guild REST endpoints (require JWT):
  - `GET /api/guilds` – user's joined guilds
  - `POST /api/guilds` – create guild (body: `{ name }`)
  - `DELETE /api/guilds/{guildId}` – delete guild (requires ManageGuild)
  - `GET /api/guilds/{guildId}/my-permissions` – current user's permission bitfield
  - `GET /api/guilds/{guildId}/channels` – channels for a guild
  - `POST /api/guilds/{guildId}/channels` – create channel (requires ManageChannels)
  - `GET /api/guilds/{guildId}/channels/{channelId}/messages` – last 50 messages
- Invite REST endpoints (require JWT):
  - `POST /api/guilds/{guildId}/invites` – create invite (requires CreateInstantInvite or ManageGuild; returns `{ code, shortlink, expiresAt }`; optional body: `{ expirationMinutes, maxUses }`)
  - `POST /api/invites/{code}/join` – join guild via invite code; returns `{ guildId, guildName, alreadyMember }`
- Media REST endpoints (require JWT):
  - `POST /api/media/upload` – upload file (multipart/form-data); returns `{ url, isImage, originalFileName }`; files stored in `/uploads`, max 10 MB; whitelisted extensions (images, PDF, documents, archives)
- **Role & Permissions**: `RequirePermissionFilter` enforces guild permission checks. Guild owners have all permissions; members get OR of assigned role bitfields. Permissions include CreateInstantInvite for invite creation.
- SignalR hub: `/hubs/chat`
- JWT supports both `Authorization` header and `access_token` query param (for WebSocket)

### ChatApp.Core

- **Entities**: User, Guild, Channel, Message, GuildMember, ChannelType, Role, Invite
  - `Message.AttachmentUrl` – optional relative URL to uploaded file (e.g. /uploads/xyz.png); images render inline, others as download links
  - `Invite` – Code, GuildId, CreatorId, ExpirationDate, MaxUses, Uses; short URL-safe codes for deep links
  - `User.CustomThemeCss` – optional custom CSS for profile theming (sanitized client-side)
  - `Role` – Id, GuildId, Name, Color, PermissionsBitfield; many-to-many with GuildMember
  - `GuildMember.Roles` – collection of Role; effective permissions = OR of role bitfields
- **Services**: `IPresenceService` (online/offline status), `IVoiceCoordinationService` (voice transport provisioning), `IPermissionService` (effective guild permissions)
- **Repositories**: `IMessageRepository` (high-performance raw SQL for message history)

### ChatApp.Data

- **ChatDbContext**: EF Core with PostgreSQL
- **MessageRepository**: Dapper-based implementation of `IMessageRepository`
  - `GetLast50ByChannelAsync(channelId)` – fetches last 50 messages with author username
- **PermissionService**: Computes effective guild permissions (owner = Administrator; members = OR of roles)
- Migrations: Code-First (InitialCreate, AddRolesAndPermissions, AddInvites, AddAttachmentUrlToMessage)

### ChatApp.Infra

- **StackExchange.Redis**: Connection multiplexer
- **PresenceService**: Manages user presence (Online/Offline) via Redis keys
  - `presence:user:{userId}` with configurable TTL (default 120s)
  - `SetOnlineAsync`, `SetOfflineAsync`, `IsOnlineAsync`
- **VoiceCoordinationService**: gRPC client to Node.js voice service
  - `Protos/voice.proto` – shared proto with voice-service (generates C# client via Grpc.Tools)
  - `GetRouterRtpCapabilitiesAsync` – returns router RTP capabilities for mediasoup-client Device.load()
  - `ProvisionWebRtcTransportAsync` – calls `CreateWebRtcTransport` on voice microservice
  - `ConnectTransportAsync` – completes WebRTC handshake with client DTLS parameters
  - `ProduceAsync` – creates audio/video producer, returns producer ID

### ChatApp.Realtime

- **VoiceChannelState**: Singleton in-memory state for voice channel participants (userId, connectionId, username, isMuted, isDeafened, isSpeaking). Used by ChatHub to broadcast participant changes.
- **ChatHub**: JWT-authorized SignalR hub
  - `JoinGroup(guildId)` – join a guild group (membership validated)
  - `LeaveGroup(guildId)` – leave guild group
  - `SendMessage(guildId, channelId, content, attachmentUrl?)` – persist and broadcast; content or attachmentUrl required
  - `UserTyping(guildId, channelId, isTyping)` – broadcast typing indicator
  - `GetRouterRtpCapabilities()` – returns router RTP capabilities for mediasoup-client
  - `JoinVoiceChannel(guildId, channelId)` – provisions WebRTC transport via gRPC, adds participant to VoiceChannelState, broadcasts `VoiceParticipantJoined`, returns connection details
  - `LeaveVoiceChannel(guildId, channelId)` – removes participant, broadcasts `VoiceParticipantLeft`
  - `SetVoiceMute(guildId, channelId, isMuted)` – updates mute state, broadcasts `VoiceParticipantUpdated`
  - `SetVoiceDeafen(guildId, channelId, isDeafened)` – updates deafen state, broadcasts `VoiceParticipantUpdated`
  - `SetVoiceSpeaking(guildId, channelId, isSpeaking)` – updates speaking state (from client audio levels), broadcasts `VoiceParticipantUpdated`
  - `GetVoiceParticipants(guildId, channelId)` – returns list of participants in the voice channel
  - `ConnectTransport(transportId, dtlsParameters)` – completes transport handshake
  - `CreateProducer(transportId, kind, rtpParameters)` – creates producer, returns producer ID
  - `GetChannelHistory(guildId, channelId)` – last 50 messages via Dapper
  - OnConnected: set user online
  - OnDisconnected: set user offline; if user was in a voice channel, remove and broadcast `VoiceParticipantLeft`

### Voice Service

Node.js TypeScript service in `/voice-service`:

- **Mediasoup C++ Worker**: Initialized with standard WebRTC config (listen IP `0.0.0.0`, RTC ports 10000–59999)
- **gRPC Server**: Listens on port 50051
- **Proto**: `proto/voice.proto` defines `VoiceService` with:
  - `GetRouterRtpCapabilities` – returns router RTP capabilities JSON
  - `CreateWebRtcTransport` – creates WebRTC transport, returns `id`, `iceParameters`, `iceCandidates`, `dtlsParameters`
  - `ConnectTransport` – connects transport with client DTLS parameters
  - `Produce` – creates producer, returns `producer_id`

```
voice-service/
├── proto/
│   └── voice.proto       # VoiceService.CreateWebRtcTransport
├── src/
│   └── index.ts         # Mediasoup worker + gRPC server
├── package.json
└── tsconfig.json
```

### SignalR Groups and Voice Events

- Group name: `guild:{guildId}`
- Clients join by guild ID; messages and typing events are scoped to guilds
- Message payloads include `ChannelId` so clients can route to the correct channel view
- **Voice events** (broadcast to guild group): `VoiceParticipantJoined`, `VoiceParticipantLeft`, `VoiceParticipantUpdated` – payloads include guildId, channelId, userId, connectionId, username, isMuted, isDeafened, isSpeaking; used for voice channel UI (avatars, mute icon overlay, active speaker glow)

### Data Flow

1. **Presence**: User connects → `SetOnlineAsync`; disconnects → `SetOfflineAsync`
2. **Messages**: Client calls `SendMessage` → EF persists → broadcast `MessageReceived` to guild group
3. **History**: Client fetches via REST `GET /api/guilds/{guildId}/channels/{channelId}/messages` for initial 50; new messages arrive via SignalR `MessageReceived`
4. **Typing**: Client calls `UserTyping` → broadcast `UserTyping` to others in guild
5. **Voice**: Client calls `GetRouterRtpCapabilities` → loads mediasoup Device → `getUserMedia` for mic → `JoinVoiceChannel` → ChatHub validates guild/voice channel → gRPC creates transport → client creates send transport, handles connect/produce events → `ConnectTransport` and `CreateProducer` complete handshake → audio streams to Node.js. Backend adds participant to VoiceChannelState and broadcasts `VoiceParticipantJoined` to guild. Client sets `voiceChannel` context and loads participants via `GetVoiceParticipants`. Mute/Deafen toggle buttons in main layout call `SetVoiceMute`/`SetVoiceDeafen`; client analyzes local mic levels via Web Audio API and calls `SetVoiceSpeaking` when above threshold. Other clients show mute icon overlay and glowing border on active speaker avatars.

## Client Structure (Tauri + Angular)

```
client/
├── src/
│   ├── app/
│   │   ├── components/       # ServerSidebar, ChannelList, ChatArea, VoiceChannelPanel
│   │   ├── guards/           # authGuard
│   │   ├── layouts/           # Main layout (3-column)
│   │   ├── pages/             # Login, Register
│   │   ├── services/          # AuthService, ApiService, ChatHubService, GuildChannelStateService, ThemeService, VoiceRoomService, PluginLoaderService, PluginEventBusService
│   │   ├── pipes/             # FormatMessageContentPipe (plugin message formatting)
│   │   └── environments/      # API URL, hub path
│   └── styles.scss            # CSS variables (--bg-primary, --text-main, --accent-color, etc.)
├── src-tauri/                 # Tauri Rust backend
└── angular.json
```

### MVP Components

- **ServerSidebarComponent** – Fetches and lists user's joined guilds from REST; selecting a guild loads channels and joins SignalR guild group
- **ChannelListComponent** – Displays text and voice channels for the selected guild; text channels link to chat, voice channels use VoiceRoomService; gear icon opens Theme Settings modal
- **VoiceChannelPanelComponent** – Shown in channel sidebar when in a voice channel; grid of participant avatars (initials + colored background), mute icon overlay for muted users, glowing CSS border for active speaker; data from ChatHubService.voiceParticipants (updated by VoiceParticipant* events)
- **ThemeSettingsModalComponent** – Modal for theme customization: color pickers for core CSS variables, text area for custom CSS, live preview; saves via PUT /api/users/me/theme
- **CreateInviteModalComponent** – Creates invite via POST /api/guilds/{guildId}/invites; copies shortlink (nexchat://invite/code) to clipboard
- **ChatAreaComponent** – Loads last 50 messages via REST when navigating to a channel; appends new messages from SignalR `MessageReceived`; send input invokes `SendMessage`; '+' button uploads files via `POST /api/media/upload`, attaches URL to next message; images render inline, other files as download links

### Routing

- `/login` – Login screen
- `/register` – Registration
- `/invite/:code` – Invite redirect; unauthenticated users are sent to login; authenticated users join the guild and are redirected
- `/app` – Main layout (Server sidebar | Channel list | Chat), protected by authGuard
- `/app/guild/:guildId/channel/:channelId` – Chat view for a channel

### Theming (ThemeService)

- Global CSS variables defined in `styles.scss` (e.g. `--bg-primary`, `--text-main`, `--accent-color`)
- `ThemeService.applyCustomTheme(customThemeCss, scopeId)` – sanitizes and injects user `CustomThemeCss` from DB
- `ThemeService.sanitizeCss(css)` – public method; strips `javascript:`, `expression()`, `-moz-binding`, `behavior`, `vbscript:`, etc. Used by ThemeSettingsModal preview
- All custom CSS must pass through `sanitizeCss` before DOM injection; never use `bypassSecurityTrustStyle` with raw user CSS
- Call when viewing different profiles or switching servers; MainLayoutComponent applies current user's theme on load

### REST API (ApiService)

- `getUserProfile()` – current user profile (id, username, customThemeCss)
- `updateUserTheme(customThemeCss)` – PUT to /api/users/me/theme
- `getGuilds()` – user's joined guilds
- `createGuild(name)`, `deleteGuild(guildId)`, `createChannel(guildId, name, type)` – guild/channel management
- `createInvite(guildId, options?)` – create invite, returns shortlink; `joinGuildViaInvite(code)` – join guild via invite
- `getMyPermissions(guildId)` – permission bitfield for conditional UI (Create Channel, Delete Server)
- `getChannels(guildId)` – channels for a guild
- `getChannelMessages(guildId, channelId)` – last 50 messages (initial load for ChatArea)
- `uploadMedia(file)` – upload file, returns `{ url, isImage, originalFileName }` for use as message attachment

### SignalR Integration (ChatHubService)

- Connects to `/hubs/chat` with JWT (`accessTokenFactory`)
- Handles `MessageReceived` events; appends to `messages()` signal when payload matches `setCurrentChannel(channelId)`
- Methods: `connect(accessToken)`, `joinGroup(guildId)`, `leaveGroup(guildId)`, `sendMessage(guildId, channelId, content, attachmentUrl?)`, `setCurrentChannel(channelId)`, `setMessages(msgs)`, `getChannelHistory(...)`, `getRouterRtpCapabilities()`, `joinVoiceChannel(guildId, channelId)`, `connectTransport(...)`, `createProducer(...)`, `setVoiceChannel(guildId, channelId)`, `leaveVoiceChannel(guildId, channelId)`, `setVoiceMute(...)`, `setVoiceDeafen(...)`, `setVoiceSpeaking(...)`
- **VoiceRoomService**: Mediasoup-client integration for voice channels. `joinVoiceChannel(guildId, channelId)` orchestrates: get router RTP caps → Device.load → getUserMedia → create transport → handle connect/produce → stream audio to Node.js. Notifies ChatHub via `setVoiceChannel`, `leaveVoiceChannel`, `setVoiceMute`, `setVoiceDeafen`, `setVoiceSpeaking`. Uses Web Audio API (AnalyserNode) on local mic to detect speaking; calls `setVoiceSpeaking` when level exceeds threshold. `toggleMute()` pauses/resumes mediasoup Producer and broadcasts via hub. `toggleDeafen()` updates hub and auto-mutes when deafening.

### State (GuildChannelStateService)

- `selectedGuild`, `channels`, `selectedChannel` – reactive state for ServerSidebar, ChannelList, and ChatArea
- `guildPermissions` – permission bitfield for the selected guild; used to conditionally show Create Channel and Delete Server

### Client Plugin System

- **PluginLoaderService** – On startup, uses Tauri `@tauri-apps/plugin-fs` to read `~/.freecord/plugins` (or `%USERPROFILE%\.freecord\plugins` on Windows). Discovers `.js` files, creates a safe `window.NexChatAPI` object, and executes each script with only that API in scope. Plugins run in an isolated Function scope to limit surface area.
- **PluginEventBusService** – RxJS-based event bus. Emits `MessageRenderedPayload` when messages are about to be displayed. Plugins register content transformers via `NexChatAPI.onMessageRendered(callback)` to intercept or format message text before display.
- **window.NexChatAPI** – Frozen, minimal API exposed to plugins: `onMessageRendered(callback)`, `version`. Transformers receive `(content, context)` and return transformed content (sync or Promise).
- **FormatMessageContentPipe** – Angular pipe used by ChatAreaComponent; runs plugin transformers and displays the result (use with `async` pipe).
- **Tauri capabilities** – Strictly scoped: `fs:allow-read-dir`, `fs:allow-read-text-file`, `fs:allow-exists`, `fs:allow-mkdir` limited to `$HOME/.freecord/plugins/**/*` (no broad `fs:default`).
- **Deep linking** – Tauri `@tauri-apps/plugin-deep-link` registers `nexchat://` scheme. `InviteDeepLinkService` listens for `nexchat://invite/CODE`; calls `joinGuildViaInvite` and redirects to the guild. If user is not logged in, stores invite in sessionStorage and redirects to login; after login, `processPendingInvite` runs.

## Configuration

### appsettings.json

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=chatapp;Username=postgres;Password=postgres",
    "Redis": "localhost:6379"
  },
  "Redis": {
    "PresenceTtlSeconds": 120
  },
  "Voice": {
    "Address": "http://localhost:50051"
  },
  "Jwt": {
    "Key": "...",
    "Issuer": "ChatApp.Api",
    "Audience": "ChatApp.Client",
    "ExpirationMinutes": 60
  }
}
```

## Docker Deployment

The root `docker-compose.yml` defines:

| Service | Image / Build | Ports | Purpose |
|---------|---------------|-------|---------|
| **postgres** | `postgres:16-alpine` | 5432 | PostgreSQL 16 database |
| **redis** | `redis:7-alpine` | 6379 | Presence and caching |
| **api** | `backend/Dockerfile` (multi-stage, ChatApp.Api) | 5000 | .NET 8 HTTP API, SignalR |
| **voice-service** | `voice-service/Dockerfile` | 50051 (gRPC), 10000–10100 (UDP/TCP) | Node.js Mediasoup, WebRTC |

All services share the `freecord-network` bridge network and resolve each other via Docker internal DNS (`postgres`, `redis`, `voice-service`, `api`). The API uses environment variables to connect to these services.

**Run**: `docker compose up -d` from the repo root. Apply EF migrations from the host (PostgreSQL is exposed on 5432):  
`dotnet ef database update --project backend/ChatApp.Api`.

## Conventions

- **Never** mix logic between Node.js voice service and .NET text service
- Use CSS variables in the Angular client for theming
- Create EF Core migrations for all database changes
- Strong typing and Clean Architecture throughout
