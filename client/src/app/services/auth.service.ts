import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { MOCK_TOKEN, MOCK_USER } from '../mocks/mock-data';

/** JWT and user info returned from auth endpoints */
export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
}

/** Current user profile from GET /api/users/me */
export interface UserProfile {
  id: string;
  username: string;
  customThemeCss: string;
  isServerAdmin?: boolean;
}

/**
 * AuthService manages authentication state and JWT storage.
 * Token is persisted in localStorage for session continuity.
 * Provides token for ApiService and ChatHubService.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storageKey = 'freecord_token';
  private readonly userKey = 'freecord_user';
  private readonly userIdKey = 'freecord_user_id';

  /** JWT access token. Empty when not logged in. */
  readonly token = signal<string>(this.loadToken());

  /** Cached username from login response */
  readonly username = signal<string>(this.loadUsername());

  /** Cached user ID for API calls (e.g., profile, theme) */
  readonly userId = signal<string>(this.loadUserId());

  /** Whether the user is authenticated */
  readonly isAuthenticated = computed(() => !!this.token());

  private loadToken(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(this.storageKey) ?? '';
  }

  private loadUsername(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(this.userKey) ?? '';
  }

  private loadUserId(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(this.userIdKey) ?? '';
  }

  /**
   * Logs in with email and password. Stores token and username on success.
   * In UI-only mode, any credentials succeed and set a mock session.
   */
  login(email: string, password: string): Observable<AuthResponse> {
    if (environment.uiOnly) {
      const res: AuthResponse = {
        token: MOCK_TOKEN,
        userId: MOCK_USER.id,
        username: MOCK_USER.username
      };
      localStorage.setItem(this.storageKey, res.token);
      localStorage.setItem(this.userKey, res.username);
      localStorage.setItem(this.userIdKey, res.userId);
      this.token.set(res.token);
      this.username.set(res.username);
      this.userId.set(res.userId);
      return of(res);
    }
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/api/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.storageKey, res.token);
          localStorage.setItem(this.userKey, res.username);
          localStorage.setItem(this.userIdKey, res.userId);
          this.token.set(res.token);
          this.username.set(res.username);
          this.userId.set(res.userId);
        })
      );
  }

  /**
   * Registers a new user. New registrations require admin approval;
   * response includes pendingApproval flag and does not include token.
   * In UI-only mode, acts like immediate approval and sets mock session.
   */
  register(username: string, email: string, password: string) {
    if (environment.uiOnly) {
      const res: AuthResponse = {
        token: MOCK_TOKEN,
        userId: MOCK_USER.id,
        username: username || MOCK_USER.username
      };
      localStorage.setItem(this.storageKey, res.token);
      localStorage.setItem(this.userKey, res.username);
      localStorage.setItem(this.userIdKey, res.userId);
      this.token.set(res.token);
      this.username.set(res.username);
      this.userId.set(res.userId);
      return of(res);
    }
    return this.http.post<AuthResponse | { message: string; pendingApproval: boolean }>(
      `${environment.apiUrl}/api/auth/register`,
      { username, email, password }
    );
  }

  /**
   * Logs out and clears stored credentials.
   */
  logout(): void {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.userIdKey);
    this.token.set('');
    this.username.set('');
    this.userId.set('');
    this.router.navigate(['/login']);
  }

  /**
   * Returns the current token for API requests. Use in headers or accessTokenFactory.
   */
  getToken(): string {
    return this.token();
  }

  /**
   * Stores auth data from setup/initialize. Used after first-time setup creates the admin.
   */
  setSessionFromResponse(res: { token: string; userId: string; username: string }): void {
    localStorage.setItem(this.storageKey, res.token);
    localStorage.setItem(this.userKey, res.username);
    localStorage.setItem(this.userIdKey, res.userId);
    this.token.set(res.token);
    this.username.set(res.username);
    this.userId.set(res.userId);
  }

  /**
   * Sets a mock session for UI-only mode (no backend).
   * Called by auth guard when uiOnly and user is not yet authenticated.
   */
  setMockSession(): void {
    this.setSessionFromResponse({
      token: MOCK_TOKEN,
      userId: MOCK_USER.id,
      username: MOCK_USER.username
    });
  }
}
