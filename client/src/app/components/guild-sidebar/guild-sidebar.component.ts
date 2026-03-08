import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Guild (server) list sidebar. Displays user's guilds for quick navigation.
 * Placeholder implementation; will connect to backend guild list.
 */
@Component({
  selector: 'app-guild-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guild-sidebar.component.html',
  styleUrl: './guild-sidebar.component.scss'
})
export class GuildSidebarComponent {
  /** Placeholder guild list. Will be replaced with real data from API. */
  guilds = [
    { id: '1', name: 'General', icon: null },
    { id: '2', name: 'Gaming', icon: null }
  ];
}
