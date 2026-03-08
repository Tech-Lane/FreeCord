# FreeCord Voice Service - Node.js Mediasoup with gRPC and WebRTC
# Uses Node 22 (mediasoup 3.19+ requires Node >=22); Mediasoup needs build tools for native worker
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install build deps for Mediasoup: Python + pip (for invoke), make, g++ (worker build from source when no prebuilt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
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
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser

# Copy built assets and node_modules from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/proto ./proto

# Entrypoint resolves host IP for ANNOUNCED_IP when running in Docker
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

RUN chown -R appuser:appuser /app
USER appuser

# gRPC server port (TCP)
EXPOSE 50051

# WebRTC RTC port range (UDP and TCP) - aligned with RTC_MIN_PORT/RTC_MAX_PORT env (default 40000-40100)
EXPOSE 40000-40100/udp 40000-40100/tcp

# Entrypoint sets ANNOUNCED_IP from host.docker.internal when unset; then starts Node
ENTRYPOINT ["/app/entrypoint.sh"]
