import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SetupService } from '../../services/setup.service';
import { AuthService } from '../../services/auth.service';

/**
 * First-time setup page. Shown when the server has no users.
 * Creates the initial admin account to complete setup.
 */
@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss'
})
export class SetupComponent {
  private readonly setup = inject(SetupService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  email = '';
  password = '';
  isLoading = false;
  error: string | null = null;

  onSubmit(): void {
    this.error = null;
    this.isLoading = true;
    this.setup.initialize(this.username, this.email, this.password).subscribe({
      next: (res) => {
        this.auth.setSessionFromResponse(res);
        this.router.navigate(['/app']);
      },
      error: (err) => {
        this.error = err?.error?.error ?? 'Setup failed';
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
