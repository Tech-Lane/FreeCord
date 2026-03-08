import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'freecord-sidebar-layout';

/** Default and bounds for guild (server list) sidebar width in pixels */
const DEFAULT_GUILD_WIDTH = 72;
const MIN_GUILD_WIDTH = 48;
const MAX_GUILD_WIDTH = 120;

/** Default and bounds for channel list sidebar width in pixels */
const DEFAULT_CHANNEL_WIDTH = 240;
const MIN_CHANNEL_WIDTH = 160;
const MAX_CHANNEL_WIDTH = 480;

/** Width of the visible strip when a sidebar is collapsed (fits small top expand button) */
const COLLAPSED_HANDLE_WIDTH = 24;

export interface SidebarLayoutState {
  guildCollapsed: boolean;
  channelCollapsed: boolean;
  guildWidth: number;
  channelWidth: number;
}

/**
 * Manages expand/collapse and user-resizable widths for the guild and channel sidebars.
 * Persists preferences to localStorage so they survive reloads.
 */
@Injectable({ providedIn: 'root' })
export class SidebarLayoutService {
  /** Whether the guild (server list) sidebar is collapsed */
  readonly guildCollapsed = signal(false);

  /** Whether the channel list sidebar is collapsed */
  readonly channelCollapsed = signal(false);

  /** Guild sidebar width in px when expanded */
  readonly guildWidth = signal(DEFAULT_GUILD_WIDTH);

  /** Channel sidebar width in px when expanded */
  readonly channelWidth = signal(DEFAULT_CHANNEL_WIDTH);

  /** Width in px to use for the guild sidebar (handle width when collapsed) */
  readonly effectiveGuildWidth = computed(() =>
    this.guildCollapsed() ? COLLAPSED_HANDLE_WIDTH : this.guildWidth()
  );

  /** Width in px to use for the channel sidebar (handle width when collapsed) */
  readonly effectiveChannelWidth = computed(() =>
    this.channelCollapsed() ? COLLAPSED_HANDLE_WIDTH : this.channelWidth()
  );

  readonly collapsedHandleWidth = COLLAPSED_HANDLE_WIDTH;
  readonly minGuildWidth = MIN_GUILD_WIDTH;
  readonly maxGuildWidth = MAX_GUILD_WIDTH;
  readonly minChannelWidth = MIN_CHANNEL_WIDTH;
  readonly maxChannelWidth = MAX_CHANNEL_WIDTH;

  constructor() {
    this.load();
  }

  toggleGuild(): void {
    this.guildCollapsed.update((c) => !c);
    this.persist();
  }

  toggleChannel(): void {
    this.channelCollapsed.update((c) => !c);
    this.persist();
  }

  setGuildWidth(px: number): void {
    const clamped = Math.min(MAX_GUILD_WIDTH, Math.max(MIN_GUILD_WIDTH, px));
    this.guildWidth.set(clamped);
    this.persist();
  }

  setChannelWidth(px: number): void {
    const clamped = Math.min(MAX_CHANNEL_WIDTH, Math.max(MIN_CHANNEL_WIDTH, px));
    this.channelWidth.set(clamped);
    this.persist();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as Partial<SidebarLayoutState>;
      if (typeof state.guildCollapsed === 'boolean') this.guildCollapsed.set(state.guildCollapsed);
      if (typeof state.channelCollapsed === 'boolean') this.channelCollapsed.set(state.channelCollapsed);
      if (typeof state.guildWidth === 'number' && state.guildWidth >= MIN_GUILD_WIDTH && state.guildWidth <= MAX_GUILD_WIDTH) {
        this.guildWidth.set(state.guildWidth);
      }
      if (typeof state.channelWidth === 'number' && state.channelWidth >= MIN_CHANNEL_WIDTH && state.channelWidth <= MAX_CHANNEL_WIDTH) {
        this.channelWidth.set(state.channelWidth);
      }
    } catch {
      // Ignore invalid or missing stored state
    }
  }

  private persist(): void {
    try {
      const state: SidebarLayoutState = {
        guildCollapsed: this.guildCollapsed(),
        channelCollapsed: this.channelCollapsed(),
        guildWidth: this.guildWidth(),
        channelWidth: this.channelWidth()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage may be full or disabled
    }
  }
}
