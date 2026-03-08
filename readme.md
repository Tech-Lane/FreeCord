# FreeCord

A centralized, cross-platform real-time chat application (Discord-like) with text chat, voice channels, and guild-based organization.

## Tech Stack

- **Backend**: .NET 8, Minimal APIs, EF Core, PostgreSQL, Redis, SignalR
- **Voice Service**: Node.js (TypeScript), Mediasoup (WebRTC), gRPC
- **Client**: Tauri + Angular
- **Deployment**: Docker Compose

## Getting Started

**For a complete step-by-step setup guide, see [GETTING_STARTED.md](GETTING_STARTED.md).** It covers Docker deployment, local development, and troubleshooting.

### Prerequisites

- .NET 8 SDK
- Node.js (for voice service)
- PostgreSQL
- Redis

### Backend Setup

1. Install dependencies: `dotnet restore` (in `/backend`)
2. Configure `appsettings.json` or `appsettings.Development.json`:
   - `ConnectionStrings:DefaultConnection` – PostgreSQL
   - `ConnectionStrings:Redis` – Redis (default: `localhost:6379`)
   - `Voice:Address` – voice service gRPC endpoint (default: `http://localhost:50051`)
   - `Jwt:Key` – at least 32 characters
3. Run migrations: `dotnet ef database update` (from ChatApp.Api)
4. Run the API: `dotnet run --project ChatApp.Api`

### First-Time Setup

On first deployment, the client redirects to `/setup` where you create the admin account. After that, new users register via `/register` and must be approved by an admin before logging in. The top toolbar provides app branding, search (placeholder), notifications (placeholder), help (placeholder), and a user menu (theme settings, log out). Admins use the shield icon in the channel list to open the Pending Registrations modal, and can open **Server settings** from the server menu (⋮) or from that modal to adjust server-wide preferences (client-side only; stored in the browser).

### REST API (JWT required)

- `GET /api/users/me` – current user profile (id, username, customThemeCss, isServerAdmin)
- `PUT /api/users/me/theme` – update custom theme CSS
- `GET /api/guilds` – user's joined guilds
- `POST /api/guilds` – create a guild (body: `{ name }`)
- `DELETE /api/guilds/{guildId}` – delete guild (requires ManageGuild)
- `GET /api/guilds/{guildId}/my-permissions` – current user's permission bitfield for the guild
- `GET /api/guilds/{guildId}/channels` – channels for a guild
- `POST /api/guilds/{guildId}/channels` – create channel (requires ManageChannels; body: `{ name, type }`)
- `GET /api/guilds/{guildId}/channels/{channelId}/messages` – last 50 messages
- `POST /api/media/upload` – upload file (multipart/form-data); returns `{ url, isImage, originalFileName }`; max 10 MB; whitelisted types
- `POST /api/guilds/{guildId}/invites` – create invite (returns `{ code, shortlink, expiresAt }`; optional body: `{ expirationMinutes, maxUses }`)
- `POST /api/invites/{code}/join` – join guild via invite code (returns `{ guildId, guildName, alreadyMember }`)

### SignalR Hub

- **Endpoint**: `ws://localhost:5000/hubs/chat` (or your API base URL)
- **Auth**: JWT via `Authorization: Bearer {token}` or query `?access_token={token}`. The client uses `accessTokenFactory` to pass the stored JWT from AuthService. The backend extracts the token from the query string for `/hubs/chat` WebSocket connections via `JwtBearerEvents.OnMessageReceived`.
- **CORS**: Backend allows credentials and origins `http://localhost:1420` and `tauri://localhost` for WebSocket auth.
- **Methods**:
  - `JoinGroup(guildId)` – join a guild group
  - `LeaveGroup(guildId)` – leave
  - `SendMessage(guildId, channelId, content, attachmentUrl?)` – send a message (content or attachmentUrl required)
  - `UserTyping(guildId, channelId, isTyping)` – typing indicator
  - `GetRouterRtpCapabilities()` – router RTP capabilities for mediasoup-client Device.load()
  - `JoinVoiceChannel(guildId, channelId)` – provisions WebRTC transport; returns `transportId`, `iceParameters`, `iceCandidates`, `dtlsParameters`
  - `LeaveVoiceChannel(guildId, channelId)` – leave voice channel
  - `SetVoiceMute(guildId, channelId, isMuted)` – update mute state (broadcasts to other clients)
  - `SetVoiceDeafen(guildId, channelId, isDeafened)` – update deafen state
  - `SetVoiceSpeaking(guildId, channelId, isSpeaking)` – update speaking state (from local audio levels)
  - `GetVoiceParticipants(guildId, channelId)` – list participants in voice channel
  - `ConnectTransport(transportId, dtlsParameters)` – complete transport handshake
  - `CreateProducer(transportId, kind, rtpParameters)` – create producer, returns `producerId`
  - `GetChannelHistory(guildId, channelId)` – last 50 messages
- **Events (server → client)**:
  - `MessageReceived` – new message payload
  - `UserTyping` – typing indicator payload
  - `VoiceParticipantJoined` – user joined voice channel (userId, username, isMuted, isDeafened, isSpeaking)
  - `VoiceParticipantLeft` – user left voice channel
  - `VoiceParticipantUpdated` – user's mute/deafen/speaking state changed

### Client Setup (Tauri + Angular)

1. Install dependencies: `npm install` (in `/client`)
2. Run in browser: `npm start` (Angular dev server at `http://localhost:4200`)
3. Run as Tauri desktop app: `npm run tauri:dev`
4. Build Tauri app: `npm run tauri:build`

**Production build**: Before `npm run tauri:build`, set `apiUrl` in `src/environments/environment.prod.ts` to your production .NET backend URL (e.g. `https://api.yourserver.com`). The build produces an optimized Angular bundle and a Windows installer (`.msi` and `.exe`) in `client/src-tauri/target/release/bundle/`. Voice gRPC (port 50051) is configured on the backend; the client connects only to the API for REST and SignalR.

**Structure**: First visit → Setup (create admin) or Login/Register → Main layout (Server sidebar | Channel list | Chat area). `ServerSidebarComponent` fetches guilds via REST; `ChannelListComponent` shows channels per guild, including Create Invite (server menu); `ChatAreaComponent` loads message history via REST and receives real-time messages via SignalR. `AuthService` stores JWT; `ApiService` calls REST endpoints; `ChatHubService` connects to SignalR. `VoiceRoomService` uses mediasoup-client for voice channels. When in a voice channel: **VoiceChannelPanel** shows a grid of participant avatars in the channel sidebar; muted users display a red mute icon overlay; the active speaker (from local mic level analysis) has a glowing accent border. **Voice controls bar** (Mute / Deafen) appears at the bottom of the main layout; Mute pauses the mediasoup Producer and broadcasts via SignalR so other clients show the muted icon; Deafen follows Discord behavior (also mutes). **Attachments**: '+' button next to chat input opens file picker; uploads go to `POST /api/media/upload`; returned URL is sent with `SendMessage`; images render inline, other files as download links. **Invite system**: Create Invite modal generates shortlinks (`nexchat://invite/CODE`); Tauri deep-link handler catches these, calls Join Server API, and redirects into the guild.

**Plugins**: Client-side plugins load from `~/.freecord/plugins` (`.js` files). Create the directory manually if it does not exist; copy `client/plugins/example.js` into it. Plugins receive `window.NexChatAPI` with `onMessageRendered(callback)` to transform message text before display. Requires Tauri desktop (not browser). Tauri fs allowlist grants readDir and readFile only, scoped to `$HOME/.freecord/plugins/*`.

### Docker Deployment (Recommended)

From the repo root, run:

```bash
docker compose up -d
```

This starts PostgreSQL 16, Redis, the .NET API, and the Node.js voice service. Apply database migrations on first run (from the host, with Docker running):

```bash
dotnet ef database update --project backend/ChatApp.Api
```

- **API**: `http://localhost:5000` (SignalR hub: `ws://localhost:5000/hubs/chat`)
- **Voice gRPC**: `localhost:50051` (internal; API connects via `voice-service:50051`)
- **WebRTC ports**: 40000–40100 (UDP/TCP) exposed for ICE; ANNOUNCED_IP is auto-resolved from `host.docker.internal` so clients receive the correct host IP in ICE candidates. For LAN clients (e.g. mobile), set `ANNOUNCED_IP=192.168.1.x` in `.env` before `docker compose up`.

### Voice Service Setup (Local)

1. Install dependencies: `npm install` (in `/voice-service`)
2. Build: `npm run build`
3. Run: `npm start` (or `npm run dev` for ts-node)
4. gRPC endpoint: `localhost:50051`
5. RPCs: `GetRouterRtpCapabilities`, `CreateWebRtcTransport`, `ConnectTransport`, `Produce` – full mediasoup WebRTC flow
6. **ANNOUNCED_IP** (optional): IP advertised in ICE candidates. Default `127.0.0.1` for local dev. In Docker, set to your host's LAN IP if clients connect from other machines (e.g. `ANNOUNCED_IP=192.168.1.5`).

### Presence (Redis)

- User presence (online/offline) is managed via Redis
- Keys: `presence:user:{userId}` with TTL (default 120 seconds)
- Automatically set on SignalR connect/disconnect

## Project Structure

See [Architecture.md](Architecture.md) for detailed architecture documentation.
