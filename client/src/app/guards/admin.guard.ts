import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take, catchError, of } from 'rxjs';
import { ApiService } from '../services/api.service';
import { environment } from '../../environments/environment';

/**
 * Admin guard protects routes that require server admin (e.g. Admin Settings).
 * Runs after authGuard; redirects to /app if the user is not a server admin.
 * In UI-only mode, always allows access so the admin settings page can be tested and tweaked.
 */
export const adminGuard: CanActivateFn = () => {
  if (environment.uiOnly) {
    return true;
  }
  const api = inject(ApiService);
  const router = inject(Router);

  return api.getUserProfile().pipe(
    take(1),
    map((profile) => (profile?.isServerAdmin === true ? true : router.createUrlTree(['/app']))),
    catchError(() => of(router.createUrlTree(['/app'])))
  );
};
