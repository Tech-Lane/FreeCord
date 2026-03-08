import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatHubService } from '../../services/chat-hub.service';

/**
 * Chat area component. Displays messages and handles sending for a channel.
 * Connects to SignalR ChatHub for real-time message updates.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {
  private readonly chatHub = inject(ChatHubService);

  /** Messages for the current channel. Updated by ChatHubService via MessageReceived. */
  messages = this.chatHub.messages;

  /** Current channel placeholder. Will be set from route params. */
  channelName = 'general';
}
