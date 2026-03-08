import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

/**
 * Registration screen. Creates a new account; new users require admin approval before logging in.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  email = '';
  password = '';
  isLoading = false;
  error: string | null = null;
  successMessage: string | null = null;

  onSubmit(): void {
    this.error = null;
    this.successMessage = null;
    this.isLoading = true;
    this.auth.register(this.username, this.email, this.password).subscribe({
      next: (res) => {
        if ('pendingApproval' in res && res.pendingApproval) {
          this.successMessage =
            res.message ?? 'Registration successful. Your account is pending admin approval.';
          // Redirect to login after a short delay
          setTimeout(() => this.router.navigate(['/login']), 2500);
        } else if ('token' in res) {
          // Legacy: auto-approved (shouldn't happen with new flow)
          this.auth.setSessionFromResponse(res as { token: string; userId: string; username: string });
          this.router.navigate(['/app']);
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.error = err?.error?.error ?? 'Registration failed';
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
