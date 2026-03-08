import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Guard for the default route ('').
 * When UI-only mode is enabled, sets a mock session and redirects to /app
 * so the user lands in the main layout with mock data. Otherwise allows
 * the normal redirect to /setup.
 */
export const defaultRouteGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  if (environment.uiOnly) {
    if (!auth.isAuthenticated()) {
      auth.setMockSession();
    }
    // Land in first mock guild/channel so UI shows messages immediately
    return router.createUrlTree(['/app', 'guild', 'guild-1', 'channel', 'ch-1-1']);
  }
  return true;
};
