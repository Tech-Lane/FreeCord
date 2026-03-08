/**
 * FreeCord Voice Service
 *
 * Node.js TypeScript service that:
 * - Initializes a Mediasoup C++ worker with standard WebRTC configurations
 * - Exposes a gRPC server with CreateWebRtcTransport endpoint
 * - Returns transport parameters (id, iceParameters, iceCandidates, dtlsParameters)
 *
 * WebRTC/ICE: ANNOUNCED_IP is advertised to clients in ICE candidates so they can
 * route audio correctly. When running in Docker, this should be the host's reachable
 * IP (e.g., from host.docker.internal resolution or explicit env). Fallback: 127.0.0.1.
 */

import * as path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as mediasoup from "mediasoup";

// Configuration - RTC ports configurable for Docker port mapping alignment
const GRPC_PORT = 50051;
const RTC_MIN_PORT = parseInt(process.env.RTC_MIN_PORT ?? "40000", 10);
const RTC_MAX_PORT = parseInt(process.env.RTC_MAX_PORT ?? "40100", 10);
const LISTEN_IP = "0.0.0.0";
/** IP advertised in ICE candidates; clients connect to this. Fallback for local dev. */
const ANNOUNCED_IP = process.env.ANNOUNCED_IP ?? "127.0.0.1";

// Mediasoup state
let worker: mediasoup.types.Worker | null = null;
let router: mediasoup.types.Router | null = null;
let webRtcServer: mediasoup.types.WebRtcServer | null = null;

/** Active WebRTC transports by ID for connect/produce handlers. */
const transports = new Map<string, mediasoup.types.WebRtcTransport>();

/**
 * Initialize Mediasoup C++ worker with standard WebRTC configurations.
 */
async function initMediasoupWorker(): Promise<void> {
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
  });

  worker.on("died", (error: Error) => {
    console.error("[mediasoup] Worker died:", error);
    process.exit(1);
  });

  console.log(`[mediasoup] Worker created (PID: ${worker.pid})`);

  // Create WebRtcServer with listen IPs and port range.
  // announcedAddress: IP advertised in ICE candidates so clients can route audio.
  // Required when listening on 0.0.0.0; uses ANNOUNCED_IP env (fallback 127.0.0.1).
  webRtcServer = await worker.createWebRtcServer({
    listenInfos: [
      {
        protocol: "udp",
        ip: LISTEN_IP,
        portRange: { min: RTC_MIN_PORT, max: RTC_MAX_PORT },
        announcedAddress: ANNOUNCED_IP,
      },
      {
        protocol: "tcp",
        ip: LISTEN_IP,
        portRange: { min: RTC_MIN_PORT, max: RTC_MAX_PORT },
        announcedAddress: ANNOUNCED_IP,
      },
    ],
  });
  console.log(`[mediasoup] WebRtcServer created (RTC ${RTC_MIN_PORT}-${RTC_MAX_PORT}, announced: ${ANNOUNCED_IP})`);

  // Create router with default media codecs for voice
  const mediaCodecs: mediasoup.types.RouterRtpCodecCapability[] = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
    },
  ];

  router = await worker.createRouter({ mediaCodecs });
  console.log("[mediasoup] Router created");
}

/**
 * Map Mediasoup transport to gRPC response format.
 */
function mapTransportToResponse(transport: mediasoup.types.WebRtcTransport) {
  const iceParams = transport.iceParameters;
  const dtlsParams = transport.dtlsParameters;

  return {
    id: transport.id,
    ice_parameters: {
      username_fragment: iceParams.usernameFragment,
      password: iceParams.password,
      ice_lite: iceParams.iceLite ?? false,
    },
    ice_candidates: transport.iceCandidates.map((c: mediasoup.types.IceCandidate) => ({
      foundation: c.foundation,
      priority: c.priority,
      ip: c.ip,
      port: c.port,
      type: c.type,
      protocol: c.protocol,
      address: c.address ?? "",
      tcp_type: c.tcpType ?? "",
    })),
    dtls_parameters: {
      role: dtlsParams.role ?? "server",
      fingerprints: dtlsParams.fingerprints.map((f: mediasoup.types.DtlsFingerprint) => ({
        algorithm: f.algorithm,
        value: f.value,
      })),
    },
  };
}

/**
 * Load proto and start gRPC server.
 */
async function startGrpcServer(): Promise<void> {
  const PROTO_PATH = path.join(__dirname, "..", "proto", "voice.proto");

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const voiceProto = grpc.loadPackageDefinition(packageDefinition);

  const server = new grpc.Server();

  const voiceService =
    (voiceProto as { freecord?: { voice?: { VoiceService?: { service?: grpc.ServiceDefinition } } } })
      .freecord?.voice?.VoiceService?.service;

  if (!voiceService) {
    throw new Error("Failed to load VoiceService from proto");
  }

  server.addService(
    voiceService,
    {
    GetRouterRtpCapabilities: async (
      _call: grpc.ServerUnaryCall<object, { router_rtp_capabilities_json: string }>,
      callback: grpc.sendUnaryData<{ router_rtp_capabilities_json: string }>
    ) => {
      try {
        if (!router) {
          callback(
            { code: grpc.status.UNAVAILABLE, message: "Mediasoup not initialized" },
            null
          );
          return;
        }
        const caps = JSON.stringify(router.rtpCapabilities);
        callback(null, { router_rtp_capabilities_json: caps });
      } catch (err) {
        console.error("[gRPC] GetRouterRtpCapabilities error:", err);
        callback(
          {
            code: grpc.status.INTERNAL,
            message: err instanceof Error ? err.message : "Unknown error",
          },
          null
        );
      }
    },
    CreateWebRtcTransport: async (
      call: grpc.ServerUnaryCall<
        { app_data?: string },
        {
          id: string;
          ice_parameters: object;
          ice_candidates: object[];
          dtls_parameters: object;
        }
      >,
      callback: grpc.sendUnaryData<{
        id: string;
        ice_parameters: object;
        ice_candidates: object[];
        dtls_parameters: object;
      }>
    ) => {
      try {
        if (!router || !webRtcServer) {
          callback(
            {
              code: grpc.status.UNAVAILABLE,
              message: "Mediasoup not initialized",
            },
            null
          );
          return;
        }

        const transport = await router.createWebRtcTransport({
          webRtcServer,
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          appData: call.request.app_data
            ? { custom: call.request.app_data }
            : undefined,
        });

        // Store transport for connect/produce RPCs
        transports.set(transport.id, transport);
        transport.on("routerclose", () => transports.delete(transport.id));

        const response = mapTransportToResponse(transport);
        callback(null, response);
      } catch (err) {
        console.error("[gRPC] CreateWebRtcTransport error:", err);
        callback(
          {
            code: grpc.status.INTERNAL,
            message: err instanceof Error ? err.message : "Unknown error",
          },
          null
        );
      }
    },
    ConnectTransport: async (
      call: grpc.ServerUnaryCall<
        { transport_id: string; dtls_parameters: { role: string; fingerprints: Array<{ algorithm: string; value: string }> } },
        object
      >,
      callback: grpc.sendUnaryData<object>
    ) => {
      try {
        const transport = transports.get(call.request.transport_id);
        if (!transport) {
          callback(
            { code: grpc.status.NOT_FOUND, message: "Transport not found" },
            null
          );
          return;
        }
        const dp = call.request.dtls_parameters;
        const dtlsParameters: mediasoup.types.DtlsParameters = {
          role: dp.role as mediasoup.types.DtlsRole,
          fingerprints: dp.fingerprints.map((f) => ({
            algorithm: f.algorithm as mediasoup.types.FingerprintAlgorithm,
            value: f.value,
          })),
        };
        await transport.connect({ dtlsParameters });
        callback(null, {});
      } catch (err) {
        console.error("[gRPC] ConnectTransport error:", err);
        callback(
          {
            code: grpc.status.INTERNAL,
            message: err instanceof Error ? err.message : "Unknown error",
          },
          null
        );
      }
    },
    Produce: async (
      call: grpc.ServerUnaryCall<
        { transport_id: string; kind: string; rtp_parameters_json: string },
        { producer_id: string }
      >,
      callback: grpc.sendUnaryData<{ producer_id: string }>
    ) => {
      try {
        const transport = transports.get(call.request.transport_id);
        if (!transport) {
          callback(
            { code: grpc.status.NOT_FOUND, message: "Transport not found" },
            null
          );
          return;
        }
        const rtpParameters = JSON.parse(call.request.rtp_parameters_json) as mediasoup.types.RtpParameters;
        const producer = await transport.produce({
          kind: call.request.kind as mediasoup.types.MediaKind,
          rtpParameters,
        });
        callback(null, { producer_id: producer.id });
      } catch (err) {
        console.error("[gRPC] Produce error:", err);
        callback(
          {
            code: grpc.status.INTERNAL,
            message: err instanceof Error ? err.message : "Unknown error",
          },
          null
        );
      }
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[gRPC] Server listening on 0.0.0.0:${GRPC_PORT}`);
          resolve();
        }
      }
    );
  });
}

/**
 * Graceful shutdown.
 */
async function shutdown(): Promise<void> {
  if (webRtcServer) {
    webRtcServer.close();
    webRtcServer = null;
  }
  if (router) {
    router.close();
    router = null;
  }
  if (worker) {
    worker.close();
    worker = null;
  }
}

process.on("SIGINT", () => {
  shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().then(() => process.exit(0));
});

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.log("[voice-service] Starting FreeCord Voice Service...");

  await initMediasoupWorker();
  await startGrpcServer();

  console.log("[voice-service] Ready");
}

main().catch((err) => {
  console.error("[voice-service] Fatal error:", err);
  process.exit(1);
});
