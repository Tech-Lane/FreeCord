import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VoiceRoomService } from '../../services/voice-room.service';

/**
 * Channel list sidebar. Displays text and voice channels for the selected guild.
 * Placeholder implementation; will connect to backend channel list.
 * Voice channels trigger VoiceRoomService.joinVoiceChannel when clicked.
 */
@Component({
  selector: 'app-channel-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './channel-sidebar.component.html',
  styleUrl: './channel-sidebar.component.scss'
})
export class ChannelSidebarComponent {
  readonly voiceRoom = inject(VoiceRoomService);

  /** Placeholder guild name. Will be replaced with selected guild from state. */
  currentGuildName = 'General';

  /** Placeholder guild ID. Must be a valid GUID for voice to work. */
  currentGuildId = '00000000-0000-0000-0000-000000000001';

  /** Placeholder channel list. Will be replaced with real data from API. Channel IDs must be valid GUIDs. */
  channels = [
    { id: '10000000-0000-0000-0000-000000000001', name: 'general', type: 'text' as const },
    { id: '10000000-0000-0000-0000-000000000002', name: 'random', type: 'text' as const },
    { id: '10000000-0000-0000-0000-000000000003', name: 'Voice Chat', type: 'voice' as const }
  ];

  /** Whether we are currently joining (loading state). */
  joiningVoice = false;
  /** Last error message from voice join. */
  voiceError: string | null = null;

  /**
   * Handles click on a voice channel. Joins the voice channel via VoiceRoomService.
   */
  async onVoiceChannelClick(channelId: string): Promise<void> {
    if (this.voiceRoom.isInVoiceChannel() && this.voiceRoom.currentChannelId() === channelId) {
      await this.voiceRoom.leaveVoiceChannel();
      return;
    }
    this.voiceError = null;
    this.joiningVoice = true;
    try {
      await this.voiceRoom.joinVoiceChannel(this.currentGuildId, channelId);
    } catch (err) {
      this.voiceError = err instanceof Error ? err.message : 'Failed to join voice channel';
    } finally {
      this.joiningVoice = false;
    }
  }
}
