import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Response from GET /api/setup/status */
export interface SetupStatusResponse {
  isInitialized: boolean;
}

/** Response from POST /api/setup/initialize - same as login (token, userId, username) */
export interface InitializeResponse {
  token: string;
  userId: string;
  username: string;
}

/**
 * SetupService handles first-time server setup.
 * Used when the server has no users yet - creates the initial admin account.
 */
@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly http = inject(HttpClient);

  /**
   * Checks whether the server has been initialized (has at least one user).
   * Client uses this to show setup page on first deployment.
   */
  getSetupStatus(): Observable<boolean> {
    return this.http
      .get<SetupStatusResponse>(`${environment.apiUrl}/api/setup/status`)
      .pipe(map((res) => res.isInitialized));
  }

  /**
   * Creates the first admin user. Only succeeds when server has no users.
   * Returns token and user info like login - client stores and navigates to app.
   */
  initialize(username: string, email: string, password: string): Observable<InitializeResponse> {
    return this.http.post<InitializeResponse>(`${environment.apiUrl}/api/setup/initialize`, {
      username,
      email,
      password
    });
  }
}
