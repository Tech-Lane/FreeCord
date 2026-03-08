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
- SignalR hub: `/hubs/chat`
- JWT supports both `Authorization` header and `access_token` query param (for WebSocket)

### ChatApp.Core

- **Entities**: User, Guild, Channel, Message, GuildMember, ChannelType
  - `User.CustomThemeCss` – optional custom CSS for profile theming (sanitized client-side)
- **Services**: `IPresenceService` (online/offline status), `IVoiceCoordinationService` (voice transport provisioning)
- **Repositories**: `IMessageRepository` (high-performance raw SQL for message history)

### ChatApp.Data

- **ChatDbContext**: EF Core with PostgreSQL
- **MessageRepository**: Dapper-based implementation of `IMessageRepository`
  - `GetLast50ByChannelAsync(channelId)` – fetches last 50 messages with author username
- Migrations: Code-First (InitialCreate)

### ChatApp.Infra

- **StackExchange.Redis**: Connection multiplexer
- **PresenceService**: Manages user presence (Online/Offline) via Redis keys
  - `presence:user:{userId}` with configurable TTL (default 120s)
  - `SetOnlineAsync`, `SetOfflineAsync`, `IsOnlineAsync`
- **VoiceCoordinationService**: gRPC client to Node.js voice service
  - `Protos/voice.proto` – shared proto with voice-service (generates C# client via Grpc.Tools)
  - `ProvisionWebRtcTransportAsync` – calls `CreateWebRtcTransport` on voice microservice

### ChatApp.Realtime

- **ChatHub**: JWT-authorized SignalR hub
  - `JoinGroup(guildId)` – join a guild group (membership validated)
  - `LeaveGroup(guildId)` – leave guild group
  - `SendMessage(guildId, channelId, content)` – persist and broadcast to guild
  - `UserTyping(guildId, channelId, isTyping)` – broadcast typing indicator
  - `JoinVoiceChannel(guildId, channelId)` – provisions WebRTC transport via gRPC, returns connection details
  - `GetChannelHistory(guildId, channelId)` – last 50 messages via Dapper
  - OnConnected: set user online
  - OnDisconnected: set user offline

### Voice Service

Node.js TypeScript service in `/voice-service`:

- **Mediasoup C++ Worker**: Initialized with standard WebRTC config (listen IP `0.0.0.0`, RTC ports 10000–59999)
- **gRPC Server**: Listens on port 50051
- **Proto**: `proto/voice.proto` defines `VoiceService.CreateWebRtcTransport`
- **CreateWebRtcTransport**: Creates a WebRTC transport via Mediasoup and returns `id`, `iceParameters`, `iceCandidates`, `dtlsParameters`

```
voice-service/
├── proto/
│   └── voice.proto       # VoiceService.CreateWebRtcTransport
├── src/
│   └── index.ts         # Mediasoup worker + gRPC server
├── package.json
└── tsconfig.json
```

### SignalR Groups

- Group name: `guild:{guildId}`
- Clients join by guild ID; messages and typing events are scoped to guilds
- Message payloads include `ChannelId` so clients can route to the correct channel view

### Data Flow

1. **Presence**: User connects → `SetOnlineAsync`; disconnects → `SetOfflineAsync`
2. **Messages**: Client calls `SendMessage` → EF persists → broadcast `MessageReceived` to guild group
3. **History**: Client calls `GetChannelHistory` → Dapper raw SQL → returns last 50 messages
4. **Typing**: Client calls `UserTyping` → broadcast `UserTyping` to others in guild
5. **Voice**: Client calls `JoinVoiceChannel` → ChatHub validates guild membership and voice channel → `VoiceCoordinationService` gRPC call to Node.js → voice service provisions WebRTC transport → connection details returned to client over SignalR

## Client Structure (Tauri + Angular)

```
client/
├── src/
│   ├── app/
│   │   ├── components/       # Guild sidebar, Channel sidebar
│   │   ├── layouts/           # Main layout (3-column)
│   │   ├── pages/             # Login, Register, Chat
│   │   ├── services/          # ThemeService, ChatHubService
│   │   └── environments/      # API URL, hub path
│   └── styles.scss            # CSS variables (--bg-primary, --text-main, --accent-color, etc.)
├── src-tauri/                 # Tauri Rust backend
└── angular.json
```

### Routing

- `/login` – Login screen
- `/register` – Registration (placeholder)
- `/app` – Main layout (Guild sidebar | Channel sidebar | Chat)
- `/app/channel/:id` – Chat view for a channel

### Theming (ThemeService)

- Global CSS variables defined in `styles.scss` (e.g. `--bg-primary`, `--text-main`, `--accent-color`)
- `ThemeService.applyCustomTheme(customThemeCss, scopeId)` – sanitizes and injects user `CustomThemeCss` from DB
- Sanitization: strips `javascript:`, `expression()`, `-moz-binding`, `behavior`, `vbscript:`, etc.
- Call when viewing different profiles or switching servers

### SignalR Integration (ChatHubService)

- Connects to `/hubs/chat` with JWT (`accessTokenFactory`)
- Handles `MessageReceived` events; updates `messages()` signal for UI
- Methods: `connect(accessToken)`, `joinGroup(guildId)`, `sendMessage(...)`, `getChannelHistory(...)`

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
