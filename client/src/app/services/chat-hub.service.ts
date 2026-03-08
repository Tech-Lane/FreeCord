import { Injectable, signal, inject, DestroyRef } from '@angular/core';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** ICE parameters for mediasoup createSendTransport */
export interface IceParameters {
  usernameFragment: string;
  password: string;
  iceLite?: boolean;
}

/** ICE candidate for mediasoup createSendTransport */
export interface IceCandidate {
  foundation: string;
  priority: number;
  ip: string;
  port: number;
  type: string;
  protocol: string;
  address?: string;
  tcpType?: string;
}

/** DTLS parameters for mediasoup transport connect */
export interface DtlsFingerprint {
  algorithm: string;
  value: string;
}

export interface DtlsParameters {
  role: string;
  fingerprints: DtlsFingerprint[];
}

/** Transport params returned by JoinVoiceChannel for device.createSendTransport() */
export interface VoiceTransportParams {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}

/** Raw payload from server (may use different property casing) */
interface VoiceTransportParamsPayload {
  transportId?: string;
  iceParameters?: { usernameFragment?: string; password?: string; iceLite?: boolean };
  iceCandidates?: Array<{ foundation?: string; priority?: number; ip?: string; port?: number; type?: string; protocol?: string; address?: string; tcpType?: string }>;
  dtlsParameters?: { role?: string; fingerprints?: Array<{ algorithm?: string; value?: string }> };
}

function normalizeVoiceTransportParams(raw: VoiceTransportParamsPayload): VoiceTransportParams {
  const ice = raw.iceParameters ?? {};
  const dtls = raw.dtlsParameters ?? {};
  return {
    id: raw.transportId ?? '',
    iceParameters: {
      usernameFragment: ice.usernameFragment ?? '',
      password: ice.password ?? '',
      iceLite: ice.iceLite ?? false
    },
    iceCandidates: (raw.iceCandidates ?? []).map(c => ({
      foundation: c.foundation ?? '',
      priority: c.priority ?? 0,
      ip: c.ip ?? '',
      port: c.port ?? 0,
      type: c.type ?? 'host',
      protocol: c.protocol ?? 'udp',
      address: c.address,
      tcpType: c.tcpType
    })),
    dtlsParameters: {
      role: dtls.role ?? 'client',
      fingerprints: (dtls.fingerprints ?? []).map(f => ({
        algorithm: f.algorithm ?? '',
        value: f.value ?? ''
      }))
    }
  };
}

/** Voice channel participant for UI display (avatar, mute, speaking) */
export interface VoiceParticipantPayload {
  userId: string;
  connectionId: string;
  username: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
}

/** Payload received from server when a new message is broadcast (MessageReceived event) */
export interface MessageReceivedPayload {
  id: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  attachmentUrl?: string | null;
}

/** Environment/config: base URL for the API (SignalR hub) */
const HUB_URL = `${environment.apiUrl}${environment.hubPath}`;

/**
 * ChatHubService connects to the .NET SignalR ChatHub and handles real-time
 * message events. Updates the UI when ReceiveMessage (MessageReceived) events
 * arrive from the server.
 *
 * Usage: Inject in components; call connect() after auth, then joinGroup(guildId) when
 * entering a guild. JWT is read from AuthService (localStorage) via accessTokenFactory.
 * Messages are exposed via messages() signal.
 */
@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** Current SignalR connection. null when disconnected. */
  private connection: HubConnection | null = null;

  /** Reactive list of messages for the current channel. Updated by MessageReceived. */
  readonly messages = signal<MessageReceivedPayload[]>([]);

  /** Voice participants for the current voice channel. Updated by VoiceParticipant* events. */
  readonly voiceParticipants = signal<VoiceParticipantPayload[]>([]);

  /** Whether the hub is currently connected */
  readonly isConnected = signal(false);

  /** Channel ID we're viewing; MessageReceived only appends when payload matches */
  private currentChannelId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.disconnect());
  }

  /**
   * Connects to the ChatHub using the stored JWT from AuthService.
   * accessTokenFactory supplies the token as the access_token query param for WebSocket auth.
   * Call after user logs in. Reconnects automatically use the latest stored token.
   * @param _accessToken - Deprecated; token is always read from AuthService storage.
   */
  async connect(_accessToken?: string): Promise<void> {
    if (this.connection?.state === 'Connected') return;

    const builder = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => this.auth.getToken()
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information);

    this.connection = builder.build();

    this.connection.on('MessageReceived', (payload: MessageReceivedPayload) => {
      // Only append if the message is for the channel we're currently viewing
      if (this.currentChannelId && String(payload?.channelId ?? '') === this.currentChannelId) {
        this.messages.update(prev => [...prev, this.normalizePayload(payload)]);
      }
    });

    this.connection.on('VoiceParticipantJoined', (payload: VoiceParticipantPayload) => {
      this.upsertVoiceParticipant(payload);
    });

    this.connection.on('VoiceParticipantLeft', (payload: { connectionId: string }) => {
      this.removeVoiceParticipant(payload.connectionId);
    });

    this.connection.on('VoiceParticipantUpdated', (payload: VoiceParticipantPayload) => {
      this.upsertVoiceParticipant(payload);
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
   * @param attachmentUrl - Optional relative URL from media upload (e.g. /uploads/xyz.png)
   */
  async sendMessage(
    guildId: string,
    channelId: string,
    content: string,
    attachmentUrl?: string | null
  ): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    await this.connection.invoke('SendMessage', guildId, channelId, content, attachmentUrl ?? null);
  }

  /**
   * Gets router RTP capabilities for mediasoup-client Device.load().
   * Call before creating a WebRTC transport when joining a voice channel.
   */
  async getRouterRtpCapabilities(): Promise<object> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('SignalR not connected');
    }
    return this.connection.invoke<object>('GetRouterRtpCapabilities');
  }

  /**
   * Provisions a WebRTC transport for a voice channel.
   * Returns transport params for device.createSendTransport().
   */
  async joinVoiceChannel(guildId: string, channelId: string): Promise<VoiceTransportParams> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('SignalR not connected');
    }
    const raw = await this.connection.invoke<VoiceTransportParamsPayload>('JoinVoiceChannel', guildId, channelId);
    return normalizeVoiceTransportParams(raw);
  }

  /**
   * Completes the WebRTC transport handshake. Call when send transport emits 'connect'.
   */
  async connectTransport(transportId: string, dtlsParameters: object): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('SignalR not connected');
    }
    await this.connection.invoke('ConnectTransport', transportId, dtlsParameters);
  }

  /**
   * Creates a producer on a transport. Call when send transport emits 'produce'.
   * Returns the producer ID to pass to the produce callback.
   */
  async createProducer(transportId: string, kind: string, rtpParameters: object): Promise<string> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('SignalR not connected');
    }
    return this.connection.invoke<string>('CreateProducer', transportId, kind, rtpParameters);
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
   * Sets the channel we're viewing. MessageReceived will only append for this channel.
   */
  setCurrentChannel(channelId: string | null): void {
    this.currentChannelId = channelId;
  }

  /**
   * Sets the messages for the current channel (e.g., after loading history via REST).
   */
  setMessages(msgs: MessageReceivedPayload[]): void {
    this.messages.set(msgs.map(p => this.normalizePayload(p)));
  }

  /**
   * Sets the voice channel context. Call when entering/leaving a voice channel.
   * Loads initial participants and filters VoiceParticipant* events to this channel.
   */
  setVoiceChannel(guildId: string | null, channelId: string | null): void {
    this.voiceChannelGuildId = guildId;
    this.voiceChannelId = channelId;
    if (!guildId || !channelId) {
      this.voiceParticipants.set([]);
      return;
    }
    this.loadVoiceParticipants(guildId, channelId);
  }

  private voiceChannelGuildId: string | null = null;
  private voiceChannelId: string | null = null;

  private isVoiceEventForCurrentChannel(guildId: string, channelId: string): boolean {
    return this.voiceChannelGuildId === guildId && this.voiceChannelId === channelId;
  }

  private upsertVoiceParticipant(payload: VoiceParticipantPayload): void {
    const guildId = (payload as unknown as { guildId?: string }).guildId;
    const channelId = (payload as unknown as { channelId?: string }).channelId;
    if (guildId && channelId && !this.isVoiceEventForCurrentChannel(guildId, channelId)) return;

    const p = this.normalizeVoiceParticipant(payload);
    this.voiceParticipants.update((list) => {
      const idx = list.findIndex((x) => x.connectionId === p.connectionId);
      const next = [...list];
      if (idx >= 0) next[idx] = p;
      else next.push(p);
      return next;
    });
  }

  private removeVoiceParticipant(connectionId: string): void {
    this.voiceParticipants.update((list) => list.filter((p) => p.connectionId !== connectionId));
  }

  private normalizeVoiceParticipant(p: VoiceParticipantPayload): VoiceParticipantPayload {
    return {
      userId: String(p?.userId ?? ''),
      connectionId: String(p?.connectionId ?? ''),
      username: String(p?.username ?? 'Unknown'),
      isMuted: Boolean(p?.isMuted),
      isDeafened: Boolean(p?.isDeafened),
      isSpeaking: Boolean(p?.isSpeaking)
    };
  }

  private async loadVoiceParticipants(guildId: string, channelId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    try {
      const raw = await this.connection.invoke<VoiceParticipantPayload[]>('GetVoiceParticipants', guildId, channelId);
      const normalized = (raw ?? []).map((p) => this.normalizeVoiceParticipant(p));
      if (this.voiceChannelGuildId === guildId && this.voiceChannelId === channelId) {
        this.voiceParticipants.set(normalized);
      }
    } catch {
      this.voiceParticipants.set([]);
    }
  }

  /**
   * Leaves a voice channel on the hub. Call when client disconnects from voice.
   */
  async leaveVoiceChannel(guildId: string, channelId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    try {
      await this.connection.invoke('LeaveVoiceChannel', guildId, channelId);
    } catch {
      // Ignore; client will clean up locally
    }
  }

  /**
   * Updates mute state in the voice channel. Broadcasts to other clients.
   */
  async setVoiceMute(guildId: string, channelId: string, isMuted: boolean): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    try {
      await this.connection.invoke('SetVoiceMute', guildId, channelId, isMuted);
    } catch {
      // Ignore
    }
  }

  /**
   * Updates deafen state in the voice channel. Broadcasts to other clients.
   */
  async setVoiceDeafen(guildId: string, channelId: string, isDeafened: boolean): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    try {
      await this.connection.invoke('SetVoiceDeafen', guildId, channelId, isDeafened);
    } catch {
      // Ignore
    }
  }

  /**
   * Updates speaking state (from local audio level). Broadcasts to other clients.
   */
  async setVoiceSpeaking(guildId: string, channelId: string, isSpeaking: boolean): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') return;
    try {
      await this.connection.invoke('SetVoiceSpeaking', guildId, channelId, isSpeaking);
    } catch {
      // Ignore
    }
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
      editedAt: p?.editedAt ?? null,
      attachmentUrl: p?.attachmentUrl ?? null
    };
  }
}
