import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { InviteDeepLinkService } from '../../services/invite-deep-link.service';

/**
 * Login screen component. Provides the entry point for unauthenticated users.
 * Calls AuthService to authenticate and routes to /app on success.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly inviteDeepLink = inject(InviteDeepLinkService);

  email = '';
  password = '';
  isLoading = false;
  error: string | null = null;

  onSubmit(): void {
    this.error = null;
    this.isLoading = true;
    this.auth.login(this.email, this.password).subscribe({
      next: async () => {
        const handled = await this.inviteDeepLink.processPendingInvite();
        if (!handled) {
          this.router.navigate(['/app']);
        }
      },
      error: (err) => {
        this.error = err?.error?.error ?? 'Login failed';
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
