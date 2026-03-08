import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServerSidebarComponent } from '../../components/server-sidebar/server-sidebar.component';
import { ChannelListComponent } from '../../components/channel-list/channel-list.component';
import { ThemeSettingsModalComponent } from '../../components/theme-settings-modal/theme-settings-modal.component';
import { CreateInviteModalComponent } from '../../components/create-invite-modal/create-invite-modal.component';
import { VoiceChannelPanelComponent } from '../../components/voice-channel-panel/voice-channel-panel.component';
import { AdminModalComponent } from '../../components/admin-modal/admin-modal.component';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';
import { GuildChannelStateService } from '../../services/guild-channel-state.service';
import { VoiceRoomService } from '../../services/voice-room.service';

/**
 * Main application layout after authentication.
 * Provides Discord-like structure: Server sidebar | Channel list | Chat area.
 * Includes Theme Settings modal (gear icon in channel list header).
 * Voice controls (Mute/Deafen) and voice channel panel when in a voice channel.
 * Applies the user's saved CustomThemeCss on load via ThemeService.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    ServerSidebarComponent,
    ChannelListComponent,
    RouterOutlet,
    ThemeSettingsModalComponent,
    CreateInviteModalComponent,
    VoiceChannelPanelComponent,
    AdminModalComponent
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly themeService = inject(ThemeService);
  private readonly state = inject(GuildChannelStateService);

  readonly voiceRoom = inject(VoiceRoomService);

  /** Current voice channel name for the panel header */
  readonly currentVoiceChannelName = computed(() => {
    const channelId = this.voiceRoom.currentChannelId();
    if (!channelId) return 'Voice Channel';
    const channels = this.state.channels();
    const ch = channels.find((c) => c.id === channelId);
    return ch?.name ?? 'Voice Channel';
  });

  /** Controls visibility of the Theme Settings modal */
  readonly showThemeModal = signal(false);

  /** Controls visibility of the Create Invite modal */
  readonly showInviteModal = signal(false);

  /** Controls visibility of the Server Admin modal (pending registrations) */
  readonly showAdminModal = signal(false);

  /** Whether the current user is a server admin */
  readonly isServerAdmin = signal(false);

  /** Current guild ID for the invite modal */
  readonly selectedGuildId = () => this.state.guildId();

  ngOnInit(): void {
    this.api.getUserProfile().subscribe((profile) => {
      if (profile?.customThemeCss) {
        this.themeService.applyCustomTheme(profile.customThemeCss, 'current-user');
      }
      this.isServerAdmin.set(profile?.isServerAdmin ?? false);
    });
  }

  openThemeModal(): void {
    this.showThemeModal.set(true);
  }

  closeThemeModal(): void {
    this.showThemeModal.set(false);
  }

  openInviteModal(): void {
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  openAdminModal(): void {
    this.showAdminModal.set(true);
  }

  closeAdminModal(): void {
    this.showAdminModal.set(false);
  }
}
