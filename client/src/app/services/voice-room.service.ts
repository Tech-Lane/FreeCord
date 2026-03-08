import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { Device } from 'mediasoup-client';
import type { Transport, Producer, RtpCapabilities } from 'mediasoup-client/types';
import { ChatHubService } from './chat-hub.service';

/** Threshold (0–1) above which the user is considered "speaking" for active speaker UI */
const SPEAKING_THRESHOLD = 0.02;
/** Debounce: ms of silence before clearing speaking state */
const SPEAKING_DEBOUNCE_MS = 200;

/**
 * VoiceRoomService handles joining voice channels using mediasoup-client.
 *
 * Flow when a user clicks to join a voice channel:
 * 1. Ask SignalR hub for router RTP capabilities
 * 2. Initialize Mediasoup Device with device.load({ routerRtpCapabilities })
 * 3. Request microphone permissions via navigator.mediaDevices.getUserMedia
 * 4. Ask SignalR hub to create a WebRTC transport on the Node.js server
 * 5. Create send transport with device.createSendTransport(params)
 * 6. Handle 'connect' and 'produce' events to complete the handshake
 * 7. Start streaming the local audio track to the voice microservice
 */
@Injectable({ providedIn: 'root' })
export class VoiceRoomService {
  private readonly chatHub = inject(ChatHubService);
  private readonly destroyRef = inject(DestroyRef);

  /** Currently active voice session state */
  readonly isInVoiceChannel = signal(false);
  readonly currentGuildId = signal<string | null>(null);
  readonly currentChannelId = signal<string | null>(null);
  readonly isMuted = signal(false);
  readonly isDeafened = signal(false);
  readonly isSpeaking = signal(false);

  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private producer: Producer | null = null;
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private speakingCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Joins a voice channel. Orchestrates the full mediasoup WebRTC flow:
   * - Fetches router capabilities and loads the device
   * - Gets microphone access
   * - Creates transport and handles connect/produce events
   * - Starts streaming audio to the Node.js voice microservice
   *
   * @param guildId - The guild containing the voice channel
   * @param channelId - The voice channel to join
   * @throws Error if SignalR is not connected, or if any step fails
   */
  async joinVoiceChannel(guildId: string, channelId: string): Promise<void> {
    // 1. Ensure we're not already in a channel
    if (this.isInVoiceChannel()) {
      await this.leaveVoiceChannel();
    }

    // 2. Get router RTP capabilities from SignalR hub
    const routerRtpCapabilities = await this.chatHub.getRouterRtpCapabilities();
    if (!routerRtpCapabilities || typeof routerRtpCapabilities !== 'object') {
      throw new Error('Invalid router RTP capabilities received');
    }

    // 3. Initialize Mediasoup Device
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: routerRtpCapabilities as RtpCapabilities });

    // 4. Request microphone permissions
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      this.cleanupOnError();
      throw new Error('No audio track obtained from getUserMedia');
    }

    // 5. Ask SignalR hub to create WebRTC transport on Node.js server
    const transportParams = await this.chatHub.joinVoiceChannel(guildId, channelId);
    if (!transportParams.id) {
      this.cleanupOnError();
      throw new Error('Invalid transport parameters received');
    }

    // 6. Create send transport with returned parameters
    // Server returns compatible JSON; cast to satisfy mediasoup-client strict types
    const options = {
      id: transportParams.id,
      iceParameters: transportParams.iceParameters,
      iceCandidates: transportParams.iceCandidates.map((c) => ({
        foundation: c.foundation,
        priority: c.priority,
        ip: c.ip,
        port: c.port,
        type: c.type,
        protocol: c.protocol as 'udp' | 'tcp',
        address: c.address ?? c.ip,
        tcpType: c.tcpType
      })),
      dtlsParameters: transportParams.dtlsParameters
    };
    this.sendTransport = this.device.createSendTransport(
      options as Parameters<Device['createSendTransport']>[0]
    );

    // 7. Handle 'connect' event: send DTLS parameters to server
    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.chatHub.connectTransport(transportParams.id, dtlsParameters);
        callback();
      } catch (err) {
        errback(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // 8. Handle 'produce' event: create producer on server, return producer ID
    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const producerId = await this.chatHub.createProducer(
          transportParams.id,
          kind,
          rtpParameters as unknown as object
        );
        callback({ id: producerId });
      } catch (err) {
        errback(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // 9. Produce the local audio track (triggers connect and produce events)
    this.producer = await this.sendTransport.produce({ track: audioTrack });

    this.isInVoiceChannel.set(true);
    this.currentGuildId.set(guildId);
    this.currentChannelId.set(channelId);
    this.isMuted.set(false);
    this.isDeafened.set(false);

    // Sync voice channel context with hub for participant list and events
    this.chatHub.setVoiceChannel(guildId, channelId);

    // Start audio level analysis for active speaker (speaking) indicator
    this.startSpeakingDetection(audioTrack);
  }

  /**
   * Leaves the current voice channel and cleans up resources.
   */
  async leaveVoiceChannel(): Promise<void> {
    const guildId = this.currentGuildId();
    const channelId = this.currentChannelId();

    this.stopSpeakingDetection();

    try {
      if (this.producer) {
        this.producer.close();
        this.producer = null;
      }
      if (this.sendTransport) {
        this.sendTransport.close();
        this.sendTransport = null;
      }
    } catch {
      // Ignore cleanup errors
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.device = null;
    this.isInVoiceChannel.set(false);
    this.currentGuildId.set(null);
    this.currentChannelId.set(null);

    if (guildId && channelId) {
      await this.chatHub.leaveVoiceChannel(guildId, channelId);
      this.chatHub.setVoiceChannel(null, null);
    }
  }

  /**
   * Toggles mute state. When muted, pauses the mediasoup producer (stops sending audio)
   * and notifies the hub so other clients show a muted icon on our avatar.
   */
  async toggleMute(): Promise<void> {
    if (!this.producer || !this.sendTransport) return;
    const guildId = this.currentGuildId();
    const channelId = this.currentChannelId();
    if (!guildId || !channelId) return;

    const next = !this.isMuted();
    this.isMuted.set(next);
    if (next) {
      this.producer.pause();
    } else {
      this.producer.resume();
    }
    await this.chatHub.setVoiceMute(guildId, channelId, next);
  }

  /**
   * Toggles deafen state. When deafened, mutes local playback of remote audio
   * (future: when consumers exist) and notifies the hub for UI consistency.
   */
  async toggleDeafen(): Promise<void> {
    const guildId = this.currentGuildId();
    const channelId = this.currentChannelId();
    if (!guildId || !channelId) return;

    const next = !this.isDeafened();
    this.isDeafened.set(next);

    // When deafened, also mute the microphone (Discord behavior)
    if (next && this.producer) {
      this.producer.pause();
      this.isMuted.set(true);
      await this.chatHub.setVoiceMute(guildId, channelId, true);
    }
    await this.chatHub.setVoiceDeafen(guildId, channelId, next);
  }

  /**
   * Starts Web Audio API analysis of the local mic to detect when the user is speaking.
   * Emits SetVoiceSpeaking via hub so other clients can highlight our avatar.
   */
  private startSpeakingDetection(audioTrack: MediaStreamTrack): void {
    this.stopSpeakingDetection();

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      this.analyserNode = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastSpeakingTime = 0;

      this.speakingCheckInterval = setInterval(() => {
        if (!this.analyserNode || !this.isInVoiceChannel() || this.isMuted()) return;

        this.analyserNode.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = avg / 255;

        const guildId = this.currentGuildId();
        const channelId = this.currentChannelId();
        if (!guildId || !channelId) return;

        if (normalized > SPEAKING_THRESHOLD) {
          lastSpeakingTime = Date.now();
          if (!this.isSpeaking()) {
            this.isSpeaking.set(true);
            this.chatHub.setVoiceSpeaking(guildId, channelId, true);
          }
        } else {
          const elapsed = Date.now() - lastSpeakingTime;
          if (elapsed > SPEAKING_DEBOUNCE_MS && this.isSpeaking()) {
            this.isSpeaking.set(false);
            this.chatHub.setVoiceSpeaking(guildId, channelId, false);
          }
        }
      }, 50);

      this.destroyRef.onDestroy(() => this.stopSpeakingDetection());
    } catch {
      // getUserMedia may block AudioContext in some browsers; fail silently
    }
  }

  private stopSpeakingDetection(): void {
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }
    this.audioContext?.close();
    this.audioContext = null;
    this.analyserNode = null;

    const guildId = this.currentGuildId();
    const channelId = this.currentChannelId();
    if (this.isSpeaking() && guildId && channelId) {
      this.isSpeaking.set(false);
      this.chatHub.setVoiceSpeaking(guildId, channelId, false);
    }
  }

  private cleanupOnError(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.device = null;
    this.sendTransport = null;
    this.producer = null;
  }
}
