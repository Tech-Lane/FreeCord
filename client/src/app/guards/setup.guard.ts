import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SetupService } from '../services/setup.service';

/**
 * Guard for the setup page. Allows access only when server is NOT initialized.
 * If initialized, redirects to login.
 */
export const setupGuard: CanActivateFn = () => {
  const setup = inject(SetupService);
  const router = inject(Router);

  return setup.getSetupStatus().pipe(
    map((isInitialized) => {
      if (isInitialized) {
        router.navigate(['/login']);
        return false;
      }
      return true;
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};
