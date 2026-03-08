import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { GuildChannelStateService } from '../../services/guild-channel-state.service';
import { ChatHubService } from '../../services/chat-hub.service';

/**
 * InviteRedirectComponent handles /invite/:code when the user is authenticated.
 * Calls the Join Server API and redirects to the guild.
 * Used for web-based invite links (e.g. https://app.nexchat.com/invite/abc123).
 */
@Component({
  selector: 'app-invite-redirect',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="invite-redirect">
      @if (loading) {
        <p>Joining server…</p>
      }
      @if (error) {
        <p class="error">{{ error }}</p>
        <a [routerLink]="['/app']">Go to app</a>
      }
    </div>
  `,
  styles: [
    `
      .invite-redirect {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 200px;
        padding: var(--spacing-lg);
      }
      .error {
        color: var(--status-busy);
      }
    `
  ]
})
export class InviteRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly state = inject(GuildChannelStateService);
  private readonly chatHub = inject(ChatHubService);

  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    if (!code) {
      this.router.navigate(['/app']);
      return;
    }

    this.api.joinGuildViaInvite(code).subscribe({
      next: async (res) => {
        this.loading = false;
        if (!res) {
          this.error = 'Invalid or expired invite.';
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
        this.loading = false;
        this.error = 'Failed to join server.';
      }
    });
  }
}
