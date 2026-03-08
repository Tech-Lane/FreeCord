# FreeCord Client

Tauri + Angular desktop and web client for the FreeCord chat application.

## Quick Start

```bash
npm install
npm start          # Angular dev server (http://localhost:4200)
npm run tauri:dev  # Tauri desktop app (requires Rust, WebView2 on Windows)
```

## Structure

- **Routing**: `/login`, `/register`, `/app` (main layout with `/app/channel/:id`)
- **Layout**: Guild sidebar | Channel sidebar | Chat area
- **Services**:
  - `ThemeService` – applies sanitized custom CSS from user profiles (XSS-safe)
  - `ChatHubService` – SignalR connection to `.NET ChatHub`, handles `MessageReceived`
- **Theming**: CSS variables in `src/styles.scss` (`--bg-primary`, `--text-main`, `--accent-color`, etc.)

## Configuration

Edit `src/environments/environment.ts` to change the API/hub URL (default: `http://localhost:5000`).
