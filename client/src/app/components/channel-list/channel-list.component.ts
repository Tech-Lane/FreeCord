import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GuildChannelStateService } from '../../services/guild-channel-state.service';
import { VoiceRoomService } from '../../services/voice-room.service';
import { ApiService } from '../../services/api.service';
import { hasPermission, Permissions } from '../../models/permissions.model';

/**
 * ChannelListComponent displays text and voice channels for the selected guild.
 * Updates when selectedGuild changes (channels loaded by ServerSidebarComponent).
 * Text channels link to chat view; voice channels trigger VoiceRoomService.
 * Header includes theme settings and (when permitted) Create Channel and Delete Server.
 */
@Component({
  selector: 'app-channel-list',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './channel-list.component.html',
  styleUrl: './channel-list.component.scss'
})
export class ChannelListComponent {
  readonly state = inject(GuildChannelStateService);
  readonly voiceRoom = inject(VoiceRoomService);
  readonly api = inject(ApiService);

  /** Emitted when user clicks the theme settings button */
  readonly openThemeSettings = output<void>();

  /** Emitted when user clicks Create Invite */
  readonly openCreateInvite = output<void>();

  /** Whether the guild dropdown menu is open */
  readonly menuOpen = signal(false);

  /** Text channels for the selected guild */
  readonly textChannels = this.state.textChannels;

  /** Voice channels for the selected guild */
  readonly voiceChannels = this.state.voiceChannels;

  /** Current guild for display and routing */
  readonly selectedGuild = this.state.selectedGuild;

  /** Currently selected channel ID */
  readonly selectedChannelId = () => this.state.selectedChannel()?.id ?? null;

  /** Whether we are joining a voice channel */
  joiningVoice = false;
  voiceError: string | null = null;

  /** Whether the current user can manage channels (create/delete channels) */
  readonly canManageChannels = () =>
    hasPermission(this.state.guildPermissions(), Permissions.ManageChannels);

  /** Whether the current user can manage the guild (delete server) */
  readonly canManageGuild = () =>
    hasPermission(this.state.guildPermissions(), Permissions.ManageGuild);

  /** Whether the current user can create invites */
  readonly canCreateInvite = () =>
    hasPermission(this.state.guildPermissions(), Permissions.CreateInstantInvite);

  /**
   * Handles click on a voice channel. Joins via VoiceRoomService.
   */
  async onVoiceChannelClick(channelId: string): Promise<void> {
    const guildId = this.state.guildId();
    if (!guildId) return;

    if (this.voiceRoom.isInVoiceChannel() && this.voiceRoom.currentChannelId() === channelId) {
      await this.voiceRoom.leaveVoiceChannel();
      return;
    }

    this.voiceError = null;
    this.joiningVoice = true;
    try {
      await this.voiceRoom.joinVoiceChannel(guildId, channelId);
    } catch (err) {
      this.voiceError = err instanceof Error ? err.message : 'Failed to join voice channel';
    } finally {
      this.joiningVoice = false;
    }
  }

  /** Creates a new channel after prompting for name and type. Requires ManageChannels. */
  async onCreateChannel(): Promise<void> {
    const guildId = this.state.guildId();
    if (!guildId || !this.canManageChannels()) return;

    const name = window.prompt('Channel name:');
    if (!name?.trim()) return;

    const typeChoice = window.prompt('Type: text or voice (default: text)', 'text');
    const type = typeChoice?.toLowerCase() === 'voice' ? 'Voice' : 'Text';

    this.api.createChannel(guildId, name.trim(), type).subscribe((channel) => {
      if (channel) {
        const current = this.state.channels();
        this.state.setChannels([...current, { ...channel, type }]);
      }
    });
    this.menuOpen.set(false);
  }

  /** Deletes the current server after confirmation. Requires ManageGuild. */
  async onDeleteServer(): Promise<void> {
    const guildId = this.state.guildId();
    const guildName = this.state.selectedGuild()?.name;
    if (!guildId || !this.canManageGuild()) return;
    if (!window.confirm(`Are you sure you want to delete "${guildName}"? This cannot be undone.`))
      return;

    this.api.deleteGuild(guildId).subscribe((ok) => {
      if (ok) {
        this.state.setGuild(null);
        this.state.triggerGuildListRefresh();
      }
    });
    this.menuOpen.set(false);
  }

  /** Opens the Create Invite modal (emitted to parent) */
  onCreateInvite(): void {
    this.openCreateInvite.emit();
    this.menuOpen.set(false);
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
