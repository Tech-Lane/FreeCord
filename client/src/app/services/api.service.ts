import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService, UserProfile } from './auth.service';
import {
  getMockGuilds,
  getMockChannels,
  getMockMessagesDto,
  MOCK_USER,
  MOCK_PERMISSIONS
} from '../mocks/mock-data';

/** Guild (server) summary from REST API */
export interface GuildDto {
  id: string;
  name: string;
  ownerId: string;
}

/** Channel with type (text or voice) */
export interface ChannelDto {
  id: string;
  name: string;
  type: 'Text' | 'Voice' | number;
  position: number;
}

/** Message from REST or SignalR */
export interface MessageDto {
  id: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  attachmentUrl?: string | null;
}

/** Response from media upload endpoint */
export interface UploadMediaResponse {
  url: string;
  isImage: boolean;
  originalFileName: string;
}

/**
 * ApiService performs authenticated REST calls to the .NET backend.
 * Used for guilds, channels, and message history (initial load).
 * Real-time updates come via ChatHubService (SignalR).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private getHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
  }

  /**
   * Fetches the current user's profile including CustomThemeCss.
   * Used by ThemeSettingsModal for initial state.
   */
  getUserProfile(): Observable<UserProfile | null> {
    if (environment.uiOnly) {
      return of(MOCK_USER).pipe(delay(0));
    }
    return this.http
      .get<UserProfile>(`${environment.apiUrl}/api/users/me`, { headers: this.getHeaders() })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Updates the current user's custom theme CSS.
   * Persisted to PostgreSQL; ThemeService applies it after sanitization.
   */
  updateUserTheme(customThemeCss: string): Observable<{ customThemeCss: string } | null> {
    if (environment.uiOnly) {
      return of({ customThemeCss }).pipe(delay(0));
    }
    return this.http
      .put<{ customThemeCss: string }>(
        `${environment.apiUrl}/api/users/me/theme`,
        { customThemeCss },
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Fetches the guilds (servers) the current user has joined.
   */
  getGuilds(): Observable<GuildDto[]> {
    if (environment.uiOnly) {
      return of(getMockGuilds()).pipe(delay(0));
    }
    return this.http
      .get<GuildDto[]>(`${environment.apiUrl}/api/guilds`, { headers: this.getHeaders() })
      .pipe(catchError(() => of([])));
  }

  /**
   * Fetches channels for a guild. User must be a member.
   */
  getChannels(guildId: string): Observable<ChannelDto[]> {
    if (environment.uiOnly) {
      return of(getMockChannels(guildId)).pipe(delay(0));
    }
    return this.http
      .get<ChannelDto[]>(`${environment.apiUrl}/api/guilds/${guildId}/channels`, {
        headers: this.getHeaders()
      })
      .pipe(catchError(() => of([])));
  }

  /**
   * Fetches the last 50 messages for a channel.
   * Used for initial load when navigating; new messages come via SignalR.
   */
  getChannelMessages(guildId: string, channelId: string): Observable<MessageDto[]> {
    if (environment.uiOnly) {
      return of(getMockMessagesDto(channelId)).pipe(delay(0));
    }
    return this.http
      .get<MessageDto[]>(
        `${environment.apiUrl}/api/guilds/${guildId}/channels/${channelId}/messages`,
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of([])));
  }

  /**
   * Fetches the current user's effective permission bitfield for a guild.
   * Used to conditionally show Create Channel, Delete Server, etc.
   */
  getMyPermissions(guildId: string): Observable<{ permissions: number }> {
    if (environment.uiOnly) {
      return of({ permissions: MOCK_PERMISSIONS }).pipe(delay(0));
    }
    return this.http
      .get<{ permissions: number }>(`${environment.apiUrl}/api/guilds/${guildId}/my-permissions`, {
        headers: this.getHeaders()
      })
      .pipe(catchError(() => of({ permissions: 0 })));
  }

  /** Creates a new guild. The authenticated user becomes the owner. */
  createGuild(name: string): Observable<{ id: string; name: string; ownerId: string } | null> {
    if (environment.uiOnly) {
      const mock = { id: `guild-mock-${Date.now()}`, name, ownerId: this.auth.userId() };
      return of(mock).pipe(delay(0));
    }
    return this.http
      .post<{ id: string; name: string; ownerId: string }>(
        `${environment.apiUrl}/api/guilds`,
        { name },
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of(null)));
  }

  /** Deletes a guild. Requires ManageGuild permission. */
  deleteGuild(guildId: string): Observable<boolean> {
    if (environment.uiOnly) {
      return of(true).pipe(delay(0));
    }
    return this.http
      .delete(`${environment.apiUrl}/api/guilds/${guildId}`, {
        headers: this.getHeaders(),
        observe: 'response'
      })
      .pipe(
        map((r) => r.status === 204),
        catchError(() => of(false))
      );
  }

  /**
   * Creates an invite for the guild. Returns shortlink (nexchat://invite/code).
   * Requires CreateInstantInvite or ManageGuild permission.
   */
  createInvite(
    guildId: string,
    options?: { expirationMinutes?: number; maxUses?: number }
  ): Observable<{ code: string; shortlink: string; expiresAt: string | null } | null> {
    if (environment.uiOnly) {
      const code = `mock-${guildId.slice(0, 4)}-${Date.now().toString(36)}`;
      return of({ code, shortlink: `nexchat://invite/${code}`, expiresAt: null }).pipe(delay(0));
    }
    return this.http
      .post<{ code: string; shortlink: string; expiresAt: string | null }>(
        `${environment.apiUrl}/api/guilds/${guildId}/invites`,
        options ?? {},
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Joins a guild using an invite code. Returns guild info for redirect.
   * If already a member, returns guildId for navigation.
   */
  joinGuildViaInvite(code: string): Observable<{
    guildId: string;
    guildName: string;
    alreadyMember: boolean;
  } | null> {
    if (environment.uiOnly) {
      const first = getMockGuilds()[0];
      return of({
        guildId: first?.id ?? 'guild-1',
        guildName: first?.name ?? 'FreeCord Dev',
        alreadyMember: true
      }).pipe(delay(0));
    }
    return this.http
      .post<{ guildId: string; guildName: string; alreadyMember: boolean }>(
        `${environment.apiUrl}/api/invites/${encodeURIComponent(code.trim())}/join`,
        {},
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Uploads a file for chat attachment. Returns relative URL (e.g. /uploads/xyz.png).
   * Requires JWT. Use with sendMessage attachmentUrl.
   */
  uploadMedia(file: File): Observable<UploadMediaResponse | null> {
    if (environment.uiOnly) {
      return of({
        url: `/uploads/mock-${file.name}`,
        isImage: /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name),
        originalFileName: file.name
      }).pipe(delay(0));
    }
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<UploadMediaResponse>(`${environment.apiUrl}/api/media/upload`, formData, {
        headers: this.getHeaders()
      })
      .pipe(catchError(() => of(null)));
  }

  /** Creates a channel. Requires ManageChannels permission. */
  createChannel(guildId: string, name: string, type: 'Text' | 'Voice'): Observable<ChannelDto | null> {
    if (environment.uiOnly) {
      const ch: ChannelDto = {
        id: `ch-mock-${Date.now()}`,
        name,
        type: type === 'Text' ? 'Text' : 'Voice',
        position: 99
      };
      return of(ch).pipe(delay(0));
    }
    return this.http
      .post<ChannelDto>(
        `${environment.apiUrl}/api/guilds/${guildId}/channels`,
        { name, type: type === 'Text' ? 0 : 1 },
        { headers: this.getHeaders() }
      )
      .pipe(catchError(() => of(null)));
  }
}
