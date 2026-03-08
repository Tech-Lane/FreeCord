# FreeCord Voice Service

Node.js TypeScript service for WebRTC voice channels using Mediasoup and gRPC.

## Setup

```bash
npm install
npm run build
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Configuration

- **gRPC port**: 50051 (configurable in `src/index.ts`)
- **RTC port range**: 10000–59999
- **Listen IP**: 0.0.0.0 (all interfaces)

## gRPC API

### CreateWebRtcTransport

Creates a new WebRTC transport and returns connection parameters.

**Request**: `CreateWebRtcTransportRequest`
- `app_data` (optional): Custom application data

**Response**: `CreateWebRtcTransportResponse`
- `id`: Transport ID
- `ice_parameters`: ICE credentials (usernameFragment, password)
- `ice_candidates`: ICE candidates for connectivity
- `dtls_parameters`: DTLS fingerprints for secure connection

## Proto

See `proto/voice.proto` for the full Protocol Buffer definition.

## Dependencies

- **mediasoup**: WebRTC SFU
- **@grpc/grpc-js**: gRPC server
- **@grpc/proto-loader**: Proto loading at runtime
