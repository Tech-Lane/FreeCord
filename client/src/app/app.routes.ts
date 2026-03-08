import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { inviteRedirectGuard } from './guards/invite-redirect.guard';
import { setupGuard } from './guards/setup.guard';
import { initializedGuard } from './guards/initialized.guard';

/**
 * Application routing configuration.
 * - /: Default route; DefaultRedirectComponent sends to /app (UI-only) or /setup
 * - /setup: First-time setup (create admin) - only when server has no users
 * - /login: Unauthenticated login screen
 * - /register: Registration (pending admin approval)
 * - /invite/:code: Handles invite links; redirects to login if not authenticated, else joins guild
 * - /app: Main layout (server sidebar, channel list, chat area)
 * - /app/guild/:guildId/channel/:channelId: Chat view for a specific channel
 * - /app/admin/settings: Server-wide admin settings (admin only; client-side storage)
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./components/default-redirect/default-redirect.component').then(m => m.DefaultRedirectComponent)
  },
  {
    path: 'setup',
    canActivate: [setupGuard],
    loadComponent: () => import('./pages/setup/setup.component').then(m => m.SetupComponent)
  },
  {
    path: 'login',
    canActivate: [initializedGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [initializedGuard],
    loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'invite/:code',
    canActivate: [inviteRedirectGuard],
    loadComponent: () => import('./components/invite-redirect/invite-redirect.component').then(m => m.InviteRedirectComponent)
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./components/chat-area/chat-area.component').then(m => m.ChatAreaComponent) },
      {
        path: 'guild/:guildId/channel/:channelId',
        loadComponent: () => import('./components/chat-area/chat-area.component').then(m => m.ChatAreaComponent)
      },
      {
        path: 'admin/settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin-settings/admin-settings.component').then(m => m.AdminSettingsComponent)
      }
    ]
  },
  { path: '**', redirectTo: '/setup' }
];
