# FreeCord

A centralized, cross-platform real-time chat application (Discord-like) with text chat, voice channels, and guild-based organization.

## Tech Stack

- **Backend**: .NET 8, Minimal APIs, EF Core, PostgreSQL, Redis, SignalR
- **Voice Service**: Node.js (TypeScript), Mediasoup (WebRTC), gRPC
- **Client**: Tauri + Angular
- **Deployment**: Docker Compose

## Getting Started

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

### SignalR Hub

- **Endpoint**: `ws://localhost:5000/hubs/chat` (or your API base URL)
- **Auth**: JWT via `Authorization: Bearer {token}` or query `?access_token={token}`
- **Methods**:
  - `JoinGroup(guildId)` – join a guild group
  - `LeaveGroup(guildId)` – leave
  - `SendMessage(guildId, channelId, content)` – send a message
  - `UserTyping(guildId, channelId, isTyping)` – typing indicator
  - `JoinVoiceChannel(guildId, channelId)` – provisions WebRTC transport; returns `transportId`, `iceParameters`, `iceCandidates`, `dtlsParameters`
  - `GetChannelHistory(guildId, channelId)` – last 50 messages
- **Events (server → client)**:
  - `MessageReceived` – new message payload
  - `UserTyping` – typing indicator payload

### Client Setup (Tauri + Angular)

1. Install dependencies: `npm install` (in `/client`)
2. Run in browser: `npm start` (Angular dev server at `http://localhost:4200`)
3. Run as Tauri desktop app: `npm run tauri:dev`
4. Build Tauri app: `npm run tauri:build`

**Structure**: Login screen → Main layout (Guild sidebar | Channel sidebar | Chat area). Uses CSS variables for theming; `ThemeService` injects user/server custom CSS with XSS sanitization. `ChatHubService` connects to SignalR for real-time messages.

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

### Voice Service Setup (Local)

1. Install dependencies: `npm install` (in `/voice-service`)
2. Build: `npm run build`
3. Run: `npm start` (or `npm run dev` for ts-node)
4. gRPC endpoint: `localhost:50051`
5. RPC: `CreateWebRtcTransport` – returns transport params for WebRTC connection

### Presence (Redis)

- User presence (online/offline) is managed via Redis
- Keys: `presence:user:{userId}` with TTL (default 120 seconds)
- Automatically set on SignalR connect/disconnect

## Project Structure

See [Architecture.md](Architecture.md) for detailed architecture documentation.
