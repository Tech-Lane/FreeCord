import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Channel list sidebar. Displays text and voice channels for the selected guild.
 * Placeholder implementation; will connect to backend channel list.
 */
@Component({
  selector: 'app-channel-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './channel-sidebar.component.html',
  styleUrl: './channel-sidebar.component.scss'
})
export class ChannelSidebarComponent {
  /** Placeholder guild name. Will be replaced with selected guild from state. */
  currentGuildName = 'General';

  /** Placeholder channel list. Will be replaced with real data from API. */
  channels = [
    { id: '1', name: 'general', type: 'text' as const },
    { id: '2', name: 'random', type: 'text' as const },
    { id: '3', name: 'Voice Chat', type: 'voice' as const }
  ];
}
