# FreeCord — Getting Started

This guide walks you through all steps needed to get FreeCord up and running. Choose either **Docker** (recommended for quick setup) or **Local Development** (for active development).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Option A: Docker Deployment (Recommended)](#option-a-docker-deployment-recommended)
3. [Option B: Local Development Setup](#option-b-local-development-setup)
4. [Verify the Application](#verify-the-application)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### For Docker Deployment

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Docker** | 20.10+ | Run PostgreSQL, Redis, API, and voice service |
| **Docker Compose** | v2+ | Orchestrate services |
| **.NET 8 SDK** | 8.0 | Run EF migrations from host (one-time) |
| **Node.js** | 18+ (optional) | Only needed for client |

### For Local Development

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **.NET 8 SDK** | 8.0 | Backend API |
| **Node.js** | 22+ | Voice service + Angular client (mediasoup requires Node 22) |
| **PostgreSQL** | 16+ | Database |
| **Redis** | 7+ | Presence and caching |
| **Rust** (rustup + cargo) | Latest stable | Tauri desktop builds |

### Tauri Desktop Client (Optional)

If you want to build the desktop app (`npm run tauri:dev` or `npm run tauri:build`):

- **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the *Desktop development with C++* workload, or [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: Build essentials (`build-essential`) and webkit2gtk dev packages

---

## Option A: Docker Deployment (Recommended)

Best for getting the backend running quickly without installing PostgreSQL or Redis locally.

### Step 1: Start Services

From the **repository root**:

```bash
docker compose up -d
```

This starts:

- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **.NET API** on `http://localhost:5000`
- **Voice service** on `localhost:50051` (gRPC) and `40000–40100` (WebRTC)

### Step 2: Run Database Migrations

With Docker still running, apply EF Core migrations:

```bash
dotnet ef database update --project backend/ChatApp.Api
```

> **Note**: The API expects PostgreSQL at `postgres:5432` inside Docker, but from your host you use `localhost:5432`. The `--project` path is relative to the repo root.

### Step 3: Configure JWT (Important for Security)

Before exposing the app, change the JWT key. Edit `backend/ChatApp.Api/appsettings.json` and set `Jwt:Key` to a secure value of **at least 32 characters**. For Docker, override via environment variable (see [Production Deployment](#production-deployment)).

### Step 4: Run the Client

**Browser (quickest)**:

```bash
cd client
npm install
npm start
```

Open `http://localhost:4200` (Angular dev server).

**Desktop app (Tauri)**:

```bash
cd client
npm install
npm run tauri:dev
```

This starts the Angular dev server and launches the Tauri window.

### Step 5: Optional — LAN / Mobile Voice

If other devices on your LAN (or mobile) need to join voice channels, set `ANNOUNCED_IP` in `.env` before starting Docker:

```env
ANNOUNCED_IP=192.168.1.100
```

Replace with your machine’s LAN IP so ICE candidates are advertised correctly.

---

## Option B: Local Development Setup

Use this when developing backend, voice service, or client without Docker.

### Step 1: Install PostgreSQL and Redis

**PostgreSQL 16+**:

- Install from [postgresql.org](https://www.postgresql.org/download/) or your package manager.
- Create a database: `createdb chatapp` (or use `psql`).

**Redis 7+**:

- Install from [redis.io](https://redis.io/download/) or your package manager.
- Start Redis (default: `localhost:6379`).

### Step 2: Backend Configuration

1. Restore and run the API:

   ```bash
   cd backend
   dotnet restore
   dotnet run --project ChatApp.Api
   ```

2. Configure `ChatApp.Api/appsettings.json` or `appsettings.Development.json`:

   | Setting | Description | Example |
   |---------|-------------|---------|
   | `ConnectionStrings:DefaultConnection` | PostgreSQL connection | `Host=localhost;Database=chatapp;Username=postgres;Password=yourpassword` |
   | `ConnectionStrings:Redis` | Redis connection | `localhost:6379` |
   | `Voice:Address` | Voice service gRPC URL | `http://localhost:50051` |
   | `Jwt:Key` | JWT signing key (min 32 chars) | Use a strong random string |

3. Apply migrations:

   ```bash
   dotnet ef database update --project ChatApp.Api
   ```

### Step 3: Voice Service

```bash
cd voice-service
npm install
npm run build
npm start
```

- gRPC endpoint: `localhost:50051`
- WebRTC ports: `40000–40100` (UDP/TCP)

For LAN clients: set `ANNOUNCED_IP` to your machine’s LAN IP before starting.

### Step 4: Client

```bash
cd client
npm install
```

**Angular only (browser)**:

```bash
npm start
```

Open `http://localhost:4200`.

**Tauri desktop**:

```bash
npm run tauri:dev
```

### Step 5: Environment URLs

- `client/src/environments/environment.ts` — development API URL (default: `http://localhost:5000`)
- `client/src/environments/environment.prod.ts` — production API URL (used by `npm run tauri:build`)

---

## Verify the Application

1. Open the client at `http://localhost:4200` (or the Tauri window).
2. **First-time setup**: On first deployment, you will see the Setup page. Create your admin account (username, email, password). You will be logged in automatically.
3. **New users**: Other users register via **Register**. Their accounts are pending approval until an admin approves them.
4. **Admin**: As the admin, click the shield icon (🛡) in the channel list header to open Pending Registrations. Approve or deny users from there.
5. Log in with your credentials (or create a second account to test the approval flow).
4. Create a guild (server) — the + button in the server sidebar.
5. Create a text channel and a voice channel.
6. Send messages in the text channel.
7. Join the voice channel and test mute/deafen.

---

## Production Deployment

### Security Checklist

- Use a strong `Jwt:Key` (32+ chars, cryptographically random).
- Set `ANNOUNCED_IP` in `.env` to your public or LAN IP if voice is used externally.
- Do not commit secrets; use environment variables or a secret manager.
- Ensure CORS in the API allows only your frontend origin(s).

### Docker Production

Override sensitive config via environment variables:

```bash
# .env (create at repo root, do not commit)
ANNOUNCED_IP=your.public.ip
# Or for API JWT, add to docker-compose.yml:
# ConnectionStrings__DefaultConnection: "..."
# Jwt__Key: "your-secure-key"
```

### Client Production Build

Before building the desktop app:

1. Set `apiUrl` in `client/src/environments/environment.prod.ts` to your production API URL.
2. Run:

   ```bash
   cd client
   npm run tauri:build
   ```

Installer and binaries are in `client/src-tauri/target/release/bundle/`.

---

## Troubleshooting

### Database connection fails

- **Docker**: Ensure PostgreSQL is healthy: `docker compose ps`. Check `ConnectionStrings__DefaultConnection` uses `postgres` as host (inside Docker) or `localhost` from the host.
- **Local**: Verify PostgreSQL is running, database exists, and connection string matches your setup.

### Migrations fail

- Run from the repo root: `dotnet ef database update --project backend/ChatApp.Api`.
- Ensure the startup project is `ChatApp.Api` and that it references `ChatApp.Data` (where migrations live).

### Voice not working

- Voice service must be running (Docker or `npm start` in `voice-service`).
- API must reach it at `Voice:Address` (e.g. `http://localhost:50051` or `http://voice-service:50051` in Docker).
- WebRTC ports `40000–40100` must be open (UDP and TCP). For LAN/mobile, set `ANNOUNCED_IP`.

### SignalR connection fails

- CORS must allow your origin (default includes `http://localhost:1420` and `tauri://localhost`).
- JWT must be passed via `access_token` query param or `Authorization: Bearer <token>` header.

### Tauri build fails

- Install [Rust](https://rustup.rs/) and platform build tools (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)).
- On Windows, ensure the C++ build tools and Windows SDK are installed.

### Plugins not loading

- Plugins load from `~/.freecord/plugins` (or `%USERPROFILE%\.freecord\plugins` on Windows).
- Create the directory and add `.js` plugin files. Tauri desktop only (not browser).

---

## Quick Reference

| Component | URL / Port |
|-----------|------------|
| API | `http://localhost:5000` |
| SignalR Hub | `ws://localhost:5000/hubs/chat` |
| Voice gRPC | `localhost:50051` |
| Angular dev | `http://localhost:4200` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
