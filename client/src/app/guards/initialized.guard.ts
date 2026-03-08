import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SetupService } from '../services/setup.service';

/**
 * Guard for login/register. Redirects to /setup when server is NOT initialized.
 * Use on login and register routes so first-time visitors see setup instead.
 */
export const initializedGuard: CanActivateFn = () => {
  const setup = inject(SetupService);
  const router = inject(Router);

  return setup.getSetupStatus().pipe(
    map((isInitialized) => {
      if (!isInitialized) {
        router.navigate(['/setup']);
        return false;
      }
      return true;
    }),
    catchError(() => {
      router.navigate(['/setup']);
      return of(false);
    })
  );
};
