import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GuildSidebarComponent } from '../../components/guild-sidebar/guild-sidebar.component';
import { ChannelSidebarComponent } from '../../components/channel-sidebar/channel-sidebar.component';

/**
 * Main application layout after authentication.
 * Provides Discord-like structure: Guild sidebar | Channel sidebar | Chat area.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [GuildSidebarComponent, ChannelSidebarComponent, RouterOutlet],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {}
