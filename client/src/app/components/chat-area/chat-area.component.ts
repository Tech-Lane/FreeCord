import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FormatMessageContentPipe } from '../../pipes/format-message-content.pipe';
import { ApiService, MessageDto } from '../../services/api.service';
import { environment } from '../../../environments/environment';
import { ChatHubService, MessageReceivedPayload } from '../../services/chat-hub.service';
import { getMockChannelName } from '../../mocks/mock-data';
import { GuildChannelStateService } from '../../services/guild-channel-state.service';
import { AuthService } from '../../services/auth.service';

/**
 * ChatAreaComponent displays message history and a send input.
 * On channel navigation: fetches last 50 messages via REST, then appends new
 * messages from SignalR MessageReceived. Submit invokes SendMessage.
 */
@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, FormsModule, FormatMessageContentPipe],
  templateUrl: './chat-area.component.html',
  styleUrl: './chat-area.component.scss'
})
export class ChatAreaComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly chatHub = inject(ChatHubService);
  private readonly state = inject(GuildChannelStateService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Draft message text for the input */
  messageDraft = '';

  /** Pending attachment URL from media upload; sent with next message */
  pendingAttachmentUrl: string | null = null;

  /** Whether a file upload is in progress */
  uploading = signal(false);

  /** Whether history is loading */
  loading = signal(false);

  /** Messages from ChatHubService (initial load via REST + real-time via SignalR) */
  readonly messages = this.chatHub.messages;

  /** Current channel name for header */
  readonly channelName = computed(() => this.state.selectedChannel()?.name ?? 'Select a channel');

  /** Guild and channel IDs for API/SignalR */
  readonly guildId = this.state.guildId;
  readonly channelId = this.state.channelId;

  /** Current route params for guild/channel */
  private guildIdParam: string | null = null;
  private channelIdParam: string | null = null;

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.guildIdParam = params['guildId'] ?? null;
      this.channelIdParam = params['channelId'] ?? null;
      this.onRouteParamsChanged();
    });
  }

  ngOnDestroy(): void {
    this.chatHub.setCurrentChannel(null);
  }

  /**
   * Loads channel when route params change. Fetches history via REST and wires SignalR.
   * Ensures SignalR connection and guild group membership so MessageReceived events are received
   * (critical when navigating directly via URL or after page refresh, when selectGuild was never called).
   */
  private onRouteParamsChanged(): void {
    if (!this.guildIdParam || !this.channelIdParam) {
      this.chatHub.setCurrentChannel(null);
      this.chatHub.setMessages([]);
      return;
    }

    // Resolve channel name from state if available (in UI-only, fallback to mock data when channels not yet loaded)
    const channel = this.state.channels().find((c) => c.id === this.channelIdParam);
    let channelName =
      channel?.name ??
      this.state.selectedChannel()?.name ??
      (environment.uiOnly && this.guildIdParam && this.channelIdParam
        ? getMockChannelName(this.guildIdParam, this.channelIdParam)
        : null) ??
      'channel';

    // Ensure state is in sync with route
    this.state.setGuild({
      id: this.guildIdParam,
      name: this.state.selectedGuild()?.name ?? 'Server'
    });
    this.state.setChannel({
      id: this.channelIdParam,
      name: channelName,
      type: 'text'
    });

    this.chatHub.setCurrentChannel(this.channelIdParam);
    // Ensure we're in the SignalR guild group so MessageReceived broadcasts are received.
    // Required when navigating directly (URL/bookmark/refresh) since joinGroup is normally
    // only called when clicking a guild in the sidebar.
    this.ensureConnectionAndJoinGroup(this.guildIdParam);
    this.loadMessageHistory();
  }

  /**
   * Connects to SignalR and joins the guild group if not already done.
   * Must be called when viewing a channel so MessageReceived events are received.
   */
  private async ensureConnectionAndJoinGroup(guildId: string): Promise<void> {
    if (!guildId) return;
    try {
      if (!this.chatHub.isConnected()) {
        await this.chatHub.connect(this.auth.getToken());
      }
      await this.chatHub.joinGroup(guildId);
    } catch {
      // Connection/join failure; user may retry by sending or navigating
    }
  }

  /**
   * Fetches the last 50 messages via REST API and sets them in ChatHubService.
   * New messages will append via SignalR MessageReceived.
   */
  private loadMessageHistory(): void {
    if (!this.guildIdParam || !this.channelIdParam) return;

    this.loading.set(true);
    this.api.getChannelMessages(this.guildIdParam, this.channelIdParam).subscribe({
      next: (msgs) => {
        const normalized = msgs.map((m) => this.normalizeMessage(m));
        this.chatHub.setMessages(normalized);
        this.loading.set(false);
      },
      error: () => {
        this.chatHub.setMessages([]);
        this.loading.set(false);
      }
    });
  }

  /**
   * Normalizes REST response to MessageReceivedPayload shape.
   */
  private normalizeMessage(m: MessageDto): MessageReceivedPayload {
    return {
      id: String(m?.id ?? ''),
      channelId: String(m?.channelId ?? ''),
      authorId: String(m?.authorId ?? ''),
      authorUsername: String(m?.authorUsername ?? 'Unknown'),
      content: String(m?.content ?? ''),
      createdAt: m?.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
      editedAt: m?.editedAt ?? null,
      attachmentUrl: m?.attachmentUrl ?? null
    };
  }

  /**
   * Triggers the hidden file input. Call from + button click.
   */
  triggerFileInput(): void {
    document.getElementById('chat-attachment-input')?.click();
  }

  /**
   * Handles file selection: uploads to API and stores URL for next send.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const gid = this.guildId();
    const cid = this.channelId();
    if (!gid || !cid) return;

    this.uploading.set(true);
    this.api.uploadMedia(file).subscribe({
      next: (res) => {
        this.uploading.set(false);
        if (res?.url) {
          this.pendingAttachmentUrl = res.url;
        }
        input.value = '';
      },
      error: () => {
        this.uploading.set(false);
        input.value = '';
      }
    });
  }

  /** Clears the pending attachment. */
  clearPendingAttachment(): void {
    this.pendingAttachmentUrl = null;
  }

  /** Full URL for an attachment (prepends API base). */
  /** Returns the first character of the username for avatar placeholder (Discord-style). */
  getAuthorInitial(username: string | null | undefined): string {
    if (!username || username.length === 0) return '?';
    return username.charAt(0).toUpperCase();
  }

  getAttachmentFullUrl(relativeUrl: string | null | undefined): string {
    if (!relativeUrl) return '';
    const base = environment.apiUrl.replace(/\/$/, '');
    const path = relativeUrl.startsWith('/') ? relativeUrl : '/' + relativeUrl;
    return base + path;
  }

  /** Whether the attachment URL is an image (for inline preview vs download link). */
  isImageAttachment(url: string | null | undefined): boolean {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url);
  }

  /**
   * Sends the draft message via SignalR SendMessage and clears the input.
   * Includes pending attachment URL if one was uploaded.
   * Ensures we're connected and in the guild group before sending so we receive the MessageReceived broadcast.
   */
  async sendMessage(): Promise<void> {
    const content = this.messageDraft?.trim() ?? '';
    const attachmentUrl = this.pendingAttachmentUrl;

    if (!content && !attachmentUrl) return;

    const gid = this.guildId();
    const cid = this.channelId();
    if (!gid || !cid) return;

    // Ensure we're in the guild's SignalR group so we receive our own MessageReceived broadcast
    await this.ensureConnectionAndJoinGroup(gid);

    this.messageDraft = '';
    this.pendingAttachmentUrl = null;
    try {
      await this.chatHub.sendMessage(gid, cid, content, attachmentUrl);
    } catch {
      // Optionally show error to user
    }
  }

  /**
   * Handles Enter key in the input (submit on Enter, no shift).
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
