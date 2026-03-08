# To Be Done

- **Toolbar placeholders**: Toolbar search, notifications, and help buttons are UI-only placeholders. Backend support (e.g. search API, notification events, help/docs URL) and client behavior can be added later.

- **Admin settings backend**: The Admin Settings page (`/app/admin/settings`) stores server-wide preferences in localStorage only (client-side). A future backend API should persist these settings (e.g. in a ServerSettings or Config table) and enforce them (e.g. max message length, require approval, invite defaults). The client-side AdminSettingsService and AdminSettings interface are structured so that a later API can replace or sync with localStorage; until then, settings are per-browser and not enforced by the server.
