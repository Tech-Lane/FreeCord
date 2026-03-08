import { Component, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, GuildDto } from '../../services/api.service';
import { GuildChannelStateService } from '../../services/guild-channel-state.service';
import { ChatHubService } from '../../services/chat-hub.service';
import { AuthService } from '../../services/auth.service';

/**
 * ServerSidebarComponent displays the user's joined guilds (servers).
 * Fetches guild list from REST API on init and when user logs in.
 * Selecting a guild updates the channel list and joins the SignalR guild group.
 */
@Component({
  selector: 'app-server-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './server-sidebar.component.html',
  styleUrl: './server-sidebar.component.scss'
})
export class ServerSidebarComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly state = inject(GuildChannelStateService);
  private readonly chatHub = inject(ChatHubService);
  private readonly auth = inject(AuthService);

  /** Guilds fetched from API */
  guilds = new Array<GuildDto>();

  /** Whether guild list is loading */
  loading = false;

  /** Error message if fetch fails */
  error: string | null = null;

  /** Currently selected guild ID */
  selectedGuildId = () => this.state.selectedGuild()?.id ?? null;

  constructor() {
    // When auth state changes, refetch guilds
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadGuilds();
      } else {
        this.guilds = [];
      }
    });
    // When guild list is invalidated (e.g. after delete), refetch
    effect(() => {
      this.state.guildListRefreshTrigger();
      if (this.auth.isAuthenticated()) {
        this.loadGuilds();
      }
    });
  }

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.loadGuilds();
    }
  }

  /**
   * Fetches user's guilds from REST API.
   */
  loadGuilds(): void {
    this.loading = true;
    this.error = null;
    this.api.getGuilds().subscribe({
      next: (list) => {
        this.guilds = list;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load servers';
        this.loading = false;
      }
    });
  }

  /**
   * Handles guild selection. Updates state, loads channels and permissions, joins SignalR group.
   */
  async selectGuild(guild: GuildDto): Promise<void> {
    this.state.setGuild({ id: guild.id, name: guild.name });

    // Load channels for this guild
    this.api.getChannels(guild.id).subscribe((channels) => {
      this.state.setChannels(channels);
    });

    // Load current user's permissions for this guild (for conditional UI: Create Channel, Delete Server)
    this.api.getMyPermissions(guild.id).subscribe((res) => {
      this.state.setGuildPermissions(res.permissions);
    });

    // Leave previous guild group and join new one for real-time messages
    const token = this.auth.getToken();
    if (!this.chatHub.isConnected()) {
      await this.chatHub.connect(token);
    }
    await this.chatHub.joinGroup(guild.id);
  }

  /** Creates a new server (guild) and selects it. */
  onCreateServer(): void {
    const name = window.prompt('Server name:');
    if (!name?.trim()) return;

    this.api.createGuild(name.trim()).subscribe((guild) => {
      if (guild) {
        this.guilds = [...this.guilds, guild];
        this.selectGuild(guild);
      }
    });
  }
}
