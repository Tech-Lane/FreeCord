import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Pending user from GET /api/admin/pending-users */
export interface PendingUserDto {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

/**
 * AdminService provides server admin operations.
 * Used to approve or deny pending user registrations.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private getHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
  }

  /**
   * Fetches users pending admin approval. Admin only.
   */
  getPendingUsers(): Observable<PendingUserDto[]> {
    return this.http.get<PendingUserDto[]>(`${environment.apiUrl}/api/admin/pending-users`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Approves a pending user so they can log in.
   */
  approveUser(userId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/api/admin/approve-user/${userId}`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /**
   * Denies a pending user (removes their account). Requires confirmation in UI.
   */
  denyUser(userId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/api/admin/deny-user/${userId}`,
      {},
      { headers: this.getHeaders() }
    );
  }
}
