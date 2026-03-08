/**
 * UI-only development environment.
 * Use: ng serve --configuration=ui-only
 * No backend required; mock data is used for guilds, channels, messages, and auth.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000',
  hubPath: '/hubs/chat',
  uiOnly: true
};
