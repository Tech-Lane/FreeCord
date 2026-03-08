import { Injectable, signal, inject, DestroyRef } from '@angular/core';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { environment } from '../../environments/environment';

/** Payload received from server when a new message is broadcast (MessageReceived event) */
export interface MessageReceivedPayload {
  id: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
}

/** Environment/config: base URL for the API (SignalR hub) */
const HUB_URL = `${environment.apiUrl}${environment.hubPath}`;

/**
 * ChatHubService connects to the .NET SignalR ChatHub and handles real-time
 * message events. Updates the UI when ReceiveMessage (MessageReceived) events
 * arrive from the server.
 *
 * Usage: Inject in components; call connect(accessToken) after auth, then
 * joinGroup(guildId) when entering a guild. Messages are exposed via messages() signal.
 */
@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly destroyRef = inject(DestroyRef);

  /** Current SignalR connection. null when disconnected. */
  private connection: HubConnection | null = null;

  /** Reactive list of messages for the current channel. Updated by MessageReceived. */
  readonly messages = signal<MessageReceivedPayload[]>([]);

  /** Whether the hub is currently connected */
  readonly isConnected = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.disconnect());
  }

  /**
   * Connects to the ChatHub with optional JWT. Call after user logs in.
   * @param accessToken - JWT for Authorization. Pass via query param for WebSocket.
   */
  async connect(accessToken?: string): Promise<void> {
    if (this.connection?.state === 'Connected') return;

    const builder = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: accessToken ? () => accessToken : undefined
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information);

    this.connection = builder.build();

    this.connection.on('MessageReceived', (payload: MessageReceivedPayload) => {
      this.messages.update(prev => [...prev, this.normalizePayload(payload)]);
    });

    await this.connection.start();
    this.isConnected.set(true);
  }

  /**
   * Disconnects from the hub.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
      this.isConnected.set(false);
      this.messages.set([]);
    }
  }

  /**
   * Joins a guild group to receive messages for that guild.
   * Call when user selects a guild.
   */
  async joinGroup(guildId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    await this.connection.invoke('JoinGroup', guildId);
  }

  /**
   * Leaves a guild group.
   */
  async leaveGroup(guildId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    await this.connection.invoke('LeaveGroup', guildId);
  }

  /**
   * Sends a message to a channel. Server broadcasts via MessageReceived.
   */
  async sendMessage(guildId: string, channelId: string, content: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    await this.connection.invoke('SendMessage', guildId, channelId, content);
  }

  /**
   * Fetches the last 50 messages for a channel.
   */
  async getChannelHistory(guildId: string, channelId: string): Promise<MessageReceivedPayload[]> {
    if (!this.connection || this.connection.state !== 'Connected') return [];
    const raw = await this.connection.invoke<unknown[]>('GetChannelHistory', guildId, channelId);
    const normalized = (raw ?? []).map(p => this.normalizePayload(p as MessageReceivedPayload));
    this.messages.set(normalized);
    return normalized;
  }

  /**
   * Sets the messages for the current channel (e.g., after loading history).
   */
  setMessages(msgs: MessageReceivedPayload[]): void {
    this.messages.set(msgs.map(p => this.normalizePayload(p)));
  }

  /**
   * Normalizes server payload so all fields are consistently typed.
   */
  private normalizePayload(p: MessageReceivedPayload): MessageReceivedPayload {
    return {
      id: String(p?.id ?? ''),
      channelId: String(p?.channelId ?? ''),
      authorId: String(p?.authorId ?? ''),
      authorUsername: String(p?.authorUsername ?? 'Unknown'),
      content: String(p?.content ?? ''),
      createdAt: p?.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      editedAt: p?.editedAt ?? null
    };
  }
}
