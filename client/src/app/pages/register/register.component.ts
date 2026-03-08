import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Registration screen placeholder. Links back to login.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="register-container">
      <div class="register-card">
        <h1>Create Account</h1>
        <p>Registration form coming soon.</p>
        <a routerLink="/login" class="link">Back to Login</a>
      </div>
    </div>
  `,
  styles: [`
    .register-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); }
    .register-card { padding: var(--spacing-xl); background: var(--bg-secondary); border-radius: var(--radius-lg); text-align: center; }
    .link { color: var(--accent-color); }
  `]
})
export class RegisterComponent {}
