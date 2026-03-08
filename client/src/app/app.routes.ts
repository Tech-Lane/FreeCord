import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { inviteRedirectGuard } from './guards/invite-redirect.guard';

/**
 * Application routing configuration.
 * - /login: Unauthenticated login screen
 * - /invite/:code: Handles invite links; redirects to login if not authenticated, else joins guild
 * - /app: Main layout (server sidebar, channel list, chat area)
 * - /app/guild/:guildId/channel/:channelId: Chat view for a specific channel
 */
export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
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
      }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
