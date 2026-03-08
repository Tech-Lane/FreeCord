import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'freecord_admin_settings';

/**
 * Server-wide admin settings (client-side only).
 * Persisted in localStorage; backend enforcement and persistence TBD.
 * See TBD.md for future API integration.
 */
export interface AdminSettings {
  /** Registration: require admin approval for new users */
  registrationRequireApproval: boolean;
  /** Registration: allow new user sign-ups */
  registrationAllowSignup: boolean;

  /** Invites: default expiration in minutes (0 = never) */
  inviteDefaultExpirationMinutes: number;
  /** Invites: default max uses per invite (0 = unlimited) */
  inviteDefaultMaxUses: number;
  /** Invites: allow creating invites */
  inviteAllowCreating: boolean;

  /** Messages: max message length in characters */
  messageMaxLength: number;
  /** Messages: allow file attachments */
  messageAllowAttachments: boolean;
  /** Messages: max attachment size in MB */
  messageMaxAttachmentSizeMb: number;
  /** Messages: allowed file extensions (comma-separated; empty = use backend default) */
  messageAllowedFileTypes: string;

  /** Channels: max channels per guild (0 = no client limit) */
  channelMaxPerGuild: number;
  /** Channels: default type when creating channel */
  channelDefaultType: 'text' | 'voice';

  /** Security: session timeout in minutes (0 = no timeout) */
  securitySessionTimeoutMinutes: number;
  /** Security: require email verification (client preference; backend TBD) */
  securityRequireEmailVerification: boolean;

  /** Notifications: default level for new channels */
  notificationDefaultLevel: 'all' | 'mentions' | 'none';
  /** Notifications: play sound on new message */
  notificationSoundEnabled: boolean;

  /** Moderation: filter profanity (client-side placeholder) */
  moderationFilterProfanity: boolean;
  /** Moderation: auto-delete messages containing links (placeholder) */
  moderationAutoDeleteLinks: boolean;
  /** Moderation: slow mode cooldown in seconds (0 = off) */
  moderationSlowModeSeconds: number;

  /** Appearance: default theme for new users / server default */
  appearanceDefaultTheme: 'light' | 'dark' | 'system';
  /** Appearance: show member list in channel view */
  appearanceShowMemberList: boolean;
  /** Appearance: compact message layout */
  appearanceCompactMode: boolean;

  /** Voice: default push-to-talk for voice */
  voiceDefaultPushToTalk: boolean;
  /** Voice: enable echo cancellation */
  voiceEchoCancellation: boolean;
  /** Voice: enable noise suppression */
  voiceNoiseSuppression: boolean;

  /** Accessibility: reduced motion */
  accessibilityReducedMotion: boolean;
  /** Accessibility: high contrast UI */
  accessibilityHighContrast: boolean;
  /** Accessibility: font size scale (1 = normal, 1.25 = large, etc.) */
  accessibilityFontSizeScale: number;

  /** Developer: show debug info in UI */
  developerDebugMode: boolean;
  /** Developer: show API base URL (for deployment admins) */
  developerShowApiUrl: boolean;
}

/** Default values for all admin settings */
export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  registrationRequireApproval: true,
  registrationAllowSignup: true,

  inviteDefaultExpirationMinutes: 1440, // 24h
  inviteDefaultMaxUses: 0,
  inviteAllowCreating: true,

  messageMaxLength: 2000,
  messageAllowAttachments: true,
  messageMaxAttachmentSizeMb: 10,
  messageAllowedFileTypes: '',

  channelMaxPerGuild: 0,
  channelDefaultType: 'text',

  securitySessionTimeoutMinutes: 0,
  securityRequireEmailVerification: false,

  notificationDefaultLevel: 'all',
  notificationSoundEnabled: true,

  moderationFilterProfanity: false,
  moderationAutoDeleteLinks: false,
  moderationSlowModeSeconds: 0,

  appearanceDefaultTheme: 'system',
  appearanceShowMemberList: true,
  appearanceCompactMode: false,

  voiceDefaultPushToTalk: false,
  voiceEchoCancellation: true,
  voiceNoiseSuppression: true,

  accessibilityReducedMotion: false,
  accessibilityHighContrast: false,
  accessibilityFontSizeScale: 1,

  developerDebugMode: false,
  developerShowApiUrl: false
};

/**
 * AdminSettingsService persists server-wide admin preferences in localStorage.
 * Client-side only; backend API for these settings is not yet implemented.
 * Used by the Admin Settings page; other components can read settings for
 * client-side behavior (e.g. default invite expiration when creating invites).
 */
@Injectable({ providedIn: 'root' })
export class AdminSettingsService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /**
   * Loads settings from localStorage. Merges with defaults so new keys
   * are always present after app updates.
   */
  getSettings(): AdminSettings {
    if (!isPlatformBrowser(this.platformId)) {
      return { ...DEFAULT_ADMIN_SETTINGS };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_ADMIN_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<AdminSettings>;
      return { ...DEFAULT_ADMIN_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_ADMIN_SETTINGS };
    }
  }

  /**
   * Saves settings to localStorage. Only provided keys are updated; rest
   * remain from current getSettings().
   */
  saveSettings(partial: Partial<AdminSettings>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const current = this.getSettings();
    const next = { ...current, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or security error; ignore
    }
  }

  /** Resets all settings to defaults and persists. */
  resetToDefaults(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ADMIN_SETTINGS));
    } catch {
      // ignore
    }
  }
}
