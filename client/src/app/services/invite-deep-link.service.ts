import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { GuildChannelStateService } from './guild-channel-state.service';
import { ChatHubService } from './chat-hub.service';

/** Storage key for pending invite code when user needs to log in first */
const PENDING_INVITE_KEY = 'nexchat_pending_invite';

/**
 * InviteDeepLinkService handles nexchat://invite/CODE deep links.
 * - Listens for deep-link events from Tauri (@tauri-apps/plugin-deep-link)
 * - Calls the Join Server API and redirects the user into the guild
 * - When user is not logged in, stores the invite and redirects to login;
 *   after login, the pending invite is processed
 */
@Injectable({ providedIn: 'root' })
export class InviteDeepLinkService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly state = inject(GuildChannelStateService);
  private readonly chatHub = inject(ChatHubService);
  private readonly platformId = inject(PLATFORM_ID);

  private initialized = false;

  /**
   * Initializes deep-link handling. Call once when the app boots.
   * Only runs in browser (Tauri webview) context.
   */
  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.initialized) return;

    this.initialized = true;

    // Check for pending invite after login (e.g. user opened link while logged out)
    this.processPendingInvite();

    // Tauri deep-link: only available when running inside Tauri
    const tauri = (window as unknown as { __TAURI__?: { core?: unknown; plugins?: { deepLink?: unknown } } }).__TAURI__;
    if (!tauri?.plugins?.deepLink) return;

    try {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

      // Handle URLs that opened the app on cold start
      const startUrls = await getCurrent();
      if (startUrls?.length) {
        for (const url of startUrls) {
          this.handleInviteUrl(url);
        }
      }

      // Handle URLs when app is already running
      await onOpenUrl((urls) => {
        for (const url of urls) {
          this.handleInviteUrl(url);
        }
      });
    } catch (err) {
      console.warn('InviteDeepLinkService: could not init deep-link plugin', err);
    }
  }

  /**
   * Processes an invite URL (nexchat://invite/CODE).
   * If not authenticated, stores and redirects to login.
   */
  async handleInviteUrl(url: string): Promise<void> {
    const code = this.parseInviteCode(url);
    if (!code) return;

    if (this.auth.isAuthenticated()) {
      await this.joinAndNavigate(code);
    } else {
      sessionStorage.setItem(PENDING_INVITE_KEY, code);
      this.router.navigate(['/login'], { queryParams: { invite: code } });
    }
  }

  /**
   * Processes a pending invite stored in sessionStorage (e.g. after login).
   * Call this after successful authentication.
   * @returns true if an invite was processed and navigation occurred
   */
  async processPendingInvite(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    const code = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!code || !this.auth.isAuthenticated()) return false;

    sessionStorage.removeItem(PENDING_INVITE_KEY);

    return new Promise((resolve) => {
      this.api.joinGuildViaInvite(code).subscribe({
        next: async (res) => {
          if (!res) {
            resolve(false);
            return;
          }
          this.state.setGuild({ id: res.guildId, name: res.guildName });
          this.state.triggerGuildListRefresh();

          const token = this.auth.getToken();
          if (token && !this.chatHub.isConnected()) {
            await this.chatHub.connect(token);
          }
          await this.chatHub.joinGroup(res.guildId);

          this.api.getChannels(res.guildId).subscribe((channels) => {
            this.state.setChannels(channels);
            const firstText = channels.find((c) => c.type === 'Text' || c.type === 0);
            const firstChannel = firstText ?? channels[0];
            if (firstChannel) {
              this.state.setChannel({
                id: firstChannel.id,
                name: firstChannel.name,
                type: firstChannel.type === 'Voice' || firstChannel.type === 1 ? 'voice' : 'text'
              });
              this.router.navigate(['/app', 'guild', res.guildId, 'channel', firstChannel.id]);
            } else {
              this.router.navigate(['/app']);
            }
            resolve(true);
          });
        },
        error: () => {
          this.router.navigate(['/app']);
          resolve(true);
        }
      });
    });
  }

  /**
   * Joins the guild via invite code and navigates to the guild.
   */
  private async joinAndNavigate(code: string): Promise<void> {
    this.api.joinGuildViaInvite(code).subscribe({
      next: async (res) => {
        if (!res) return;
        this.state.setGuild({ id: res.guildId, name: res.guildName });
        this.state.triggerGuildListRefresh();

        const token = this.auth.getToken();
        if (token && !this.chatHub.isConnected()) {
          await this.chatHub.connect(token);
        }
        await this.chatHub.joinGroup(res.guildId);

        this.api.getChannels(res.guildId).subscribe((channels) => {
          this.state.setChannels(channels);
          const firstText = channels.find((c) => c.type === 'Text' || c.type === 0);
          const firstChannel = firstText ?? channels[0];
          if (firstChannel) {
            this.state.setChannel({
              id: firstChannel.id,
              name: firstChannel.name,
              type: firstChannel.type === 'Voice' || firstChannel.type === 1 ? 'voice' : 'text'
            });
            this.router.navigate(['/app', 'guild', res.guildId, 'channel', firstChannel.id]);
          } else {
            this.router.navigate(['/app']);
          }
        });
      },
      error: () => {
        this.router.navigate(['/app']);
      }
    });
  }

  /** Extracts invite code from nexchat://invite/CODE */
  private parseInviteCode(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'nexchat:') return null;
      const path = parsed.pathname || parsed.href.replace(/^nexchat:\/\/invite\/?/i, '');
      const match = path.match(/^\/?invite\/([a-z0-9]+)$/i) ?? parsed.href.match(/nexchat:\/\/invite\/([a-z0-9]+)/i);
      return match ? match[1].toLowerCase() : null;
    } catch {
      const match = url.match(/nexchat:\/\/invite\/([a-z0-9]+)/i);
      return match ? match[1].toLowerCase() : null;
    }
  }
}
