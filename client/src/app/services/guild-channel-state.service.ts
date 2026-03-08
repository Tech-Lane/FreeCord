import { Injectable, signal, computed } from '@angular/core';
import { GuildDto } from './api.service';
import { ChannelDto } from './api.service';

export interface SelectedChannel {
  id: string;
  name: string;
  type: 'text' | 'voice';
}

export interface SelectedGuild {
  id: string;
  name: string;
}

/**
 * GuildChannelStateService holds the currently selected guild and channel.
 * Components react to these signals to display guild-specific channels and channel-specific chat.
 */
@Injectable({ providedIn: 'root' })
export class GuildChannelStateService {
  /** Currently selected guild (server) */
  readonly selectedGuild = signal<SelectedGuild | null>(null);

  /** Channels for the selected guild */
  readonly channels = signal<ChannelDto[]>([]);

  /** Currently selected channel (for chat view) */
  readonly selectedChannel = signal<SelectedChannel | null>(null);

  /** Guild ID for the selected guild */
  readonly guildId = computed(() => this.selectedGuild()?.id ?? null);

  /** Channel ID for the selected channel */
  readonly channelId = computed(() => this.selectedChannel()?.id ?? null);

  /** Text channels only (for channel list) */
  readonly textChannels = computed(() =>
    this.channels().filter((c) => c.type === 'Text' || c.type === 0)
  );

  /** Voice channels only */
  readonly voiceChannels = computed(() =>
    this.channels().filter((c) => c.type === 'Voice' || c.type === 1)
  );

  /** Current user's permission bitfield for the selected guild. Fetched when guild changes. */
  readonly guildPermissions = signal<number>(0);

  /** Increment to signal that the guild list should be refreshed (e.g. after delete). */
  readonly guildListRefreshTrigger = signal(0);

  setGuild(guild: SelectedGuild | null): void {
    const current = this.selectedGuild();
    // Only clear channels when switching to a different guild (or null)
    const isSameGuild = guild !== null && current !== null && current.id === guild.id;

    this.selectedGuild.set(guild);
    if (!isSameGuild) {
      this.channels.set([]);
      this.selectedChannel.set(null);
    }
    if (guild === null) {
      this.guildPermissions.set(0);
    }
  }

  /** Updates the permission bitfield for the current guild. */
  setGuildPermissions(permissions: number): void {
    this.guildPermissions.set(permissions);
  }

  setChannels(channels: ChannelDto[]): void {
    this.channels.set(channels);
  }

  setChannel(channel: SelectedChannel | null): void {
    this.selectedChannel.set(channel);
  }

  /** Triggers a refresh of the guild list (e.g. after a guild is deleted). */
  triggerGuildListRefresh(): void {
    this.guildListRefreshTrigger.update((v) => v + 1);
  }
}
