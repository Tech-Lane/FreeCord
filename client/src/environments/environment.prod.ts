/**
 * Production environment. Point to your deployed .NET backend.
 * Voice gRPC (port 50051) is configured on the backend; the client connects
 * only to the API URL for REST and SignalR (including voice provisioning).
 */
export const environment = {
  production: true,
  /** Production API base URL (no trailing slash). Replace with your deployed backend, e.g. https://api.yourserver.com */
  apiUrl: 'https://api.yourserver.com',
  /** SignalR ChatHub path (relative to apiUrl) */
  hubPath: '/hubs/chat'
};
