import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard for /invite/:code route.
 * - If not authenticated: redirect to /login with invite code preserved in query param
 * - If authenticated: allow activation (InviteRedirectComponent will process the join)
 */
export const inviteRedirectGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const code = route.params['code'];

  if (!code) {
    router.navigate(['/login']);
    return false;
  }

  if (!auth.isAuthenticated()) {
    sessionStorage.setItem('nexchat_pending_invite', code);
    router.navigate(['/login'], { queryParams: { invite: code } });
    return false;
  }

  return true;
};
