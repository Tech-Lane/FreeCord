import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

/**
 * Handles the default route ('').
 * In UI-only mode: sets mock session and navigates to the first guild/channel.
 * Otherwise: navigates to /setup.
 * Used instead of redirectTo + canActivate because Angular does not allow both on the same route.
 */
@Component({
  selector: 'app-default-redirect',
  standalone: true,
  template: '<p>Redirecting…</p>'
})
export class DefaultRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    if (environment.uiOnly) {
      if (!this.auth.isAuthenticated()) {
        this.auth.setMockSession();
      }
      this.router.navigate(['/app', 'guild', 'guild-1', 'channel', 'ch-1-1']);
    } else {
      this.router.navigate(['/setup']);
    }
  }
}
