#!/bin/sh
# FreeCord Voice Service Entrypoint
# Resolves host IP for ANNOUNCED_IP when running in Docker so clients receive
# the correct IP in ICE candidates for WebRTC audio routing.
#
# Priority: ANNOUNCED_IP env > host.docker.internal resolution > 127.0.0.1
# On Linux, add extra_hosts: ["host.docker.internal:host-gateway"] in docker-compose.

set -e

if [ -z "${ANNOUNCED_IP}" ]; then
  RESOLVED=$(getent hosts host.docker.internal 2>/dev/null | awk '{ print $1 }' | head -1)
  if [ -n "${RESOLVED}" ]; then
    export ANNOUNCED_IP="${RESOLVED}"
    echo "[voice-service] ANNOUNCED_IP auto-detected: ${ANNOUNCED_IP}"
  else
    export ANNOUNCED_IP="127.0.0.1"
    echo "[voice-service] ANNOUNCED_IP fallback: 127.0.0.1 (set ANNOUNCED_IP for Docker/LAN)"
  fi
fi

exec node dist/index.js
