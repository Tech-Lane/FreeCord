import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatHubService } from '../../services/chat-hub.service';
import { AuthService } from '../../services/auth.service';

/**
 * VoiceChannelPanelComponent displays a grid of avatars for all users
 * currently connected to the voice channel. Shows mute icon overlay for
 * muted users and a glowing border for the active speaker.
 */
@Component({
  selector: 'app-voice-channel-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voice-channel-panel.component.html',
  styleUrl: './voice-channel-panel.component.scss'
})
export class VoiceChannelPanelComponent {
  readonly chatHub = inject(ChatHubService);
  readonly auth = inject(AuthService);

  /** Optional channel name for the header */
  readonly channelName = input<string>('Voice Channel');

  /** Participants from the hub (filtered to current voice channel) */
  readonly participants = this.chatHub.voiceParticipants;

  /** Current user ID to highlight self in the list */
  readonly currentUserId = this.auth.userId;

  /**
   * Generates deterministic color from username for avatar background.
   * Discord-style colored initial avatars when no profile image exists.
   */
  getAvatarColor(username: string): string {
    const hue = this.hashCode(username) % 360;
    return `hsl(${hue}, 60%, 45%)`;
  }

  /** First two characters of username for avatar initials */
  getInitials(username: string): string {
    const parts = username.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? '';
      const second = parts[1]?.[0] ?? '';
      return (first + second).toUpperCase().slice(0, 2) || '??';
    }
    return (username.slice(0, 2) || '??').toUpperCase();
  }

  private hashCode(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return Math.abs(h);
  }
}
