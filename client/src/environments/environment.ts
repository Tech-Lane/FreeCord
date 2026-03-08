/**
 * Environment configuration for the FreeCord client.
 * API and SignalR hub URLs. Override in environment.prod.ts for production.
 */
export const environment = {
  production: false,
  /** Base URL for the .NET API (no trailing slash) */
  apiUrl: 'http://localhost:5000',
  /** SignalR ChatHub path (relative to apiUrl) */
  hubPath: '/hubs/chat'
};
