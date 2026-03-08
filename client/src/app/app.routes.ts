import { Routes } from '@angular/router';

/**
 * Application routing configuration.
 * - /login: Unauthenticated login screen
 * - /app: Main layout (guild sidebar, channel sidebar, chat area)
 * - /app/channel/:id: Chat view for a specific channel
 */
export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  {
    path: 'app',
    loadComponent: () => import('./layouts/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      { path: '', redirectTo: 'channel/1', pathMatch: 'full' },
      { path: 'channel/:id', loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent) }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
