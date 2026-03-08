/**
 * Development environment.
 * For UI-only mode (no backend), use: ng serve --configuration=ui-only
 */
export const environment = {
  production: false,
  /** Base URL for the .NET API (e.g. http://localhost:5000) */
  apiUrl: 'http://localhost:5000',
  /** SignalR hub path (e.g. /hubs/chat) */
  hubPath: '/hubs/chat',
  /**
   * When true, the app runs without the backend: mock data is used for guilds,
   * channels, messages, and auth. Use for UI development and tweaks.
   */
  uiOnly: false
};
