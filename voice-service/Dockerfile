# FreeCord Voice Service - Node.js Mediasoup with gRPC and WebRTC
# Uses Node 20 LTS; Mediasoup requires build tools for native addons
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install build dependencies for Mediasoup native modules (Python, make, g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source and proto
COPY src/ ./src/
COPY proto/ ./proto/

# Build TypeScript
RUN npm run build

# Production stage - minimal runtime image
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser

# Copy built assets and node_modules from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/proto ./proto

RUN chown -R appuser:appuser /app
USER appuser

# gRPC server port (TCP)
EXPOSE 50051

# WebRTC RTC port range (UDP and TCP) - Mediasoup uses 10000-59999
# Clients connect to the voice service for WebRTC; ports must be exposed to host
EXPOSE 10000-59999/udp 10000-59999/tcp

# Mediasoup worker listens on 0.0.0.0; gRPC binds to 0.0.0.0:50051
CMD ["node", "dist/index.js"]
