import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

/**
 * Login screen component. Provides the entry point for unauthenticated users.
 * Routes to the main app layout after successful authentication.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  /** Placeholder for login form state. Will integrate with auth API later. */
  isLoading = false;
}
