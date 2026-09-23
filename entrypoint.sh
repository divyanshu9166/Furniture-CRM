#!/bin/sh
# Fix permissions on the writable named volumes before starting.
# Docker named volumes are owned by root on first creation.
# This script runs as root, fixes ownership, then drops to nextjs user.
set -e

echo "[Entrypoint] Ensuring writable application volumes..."
mkdir -p /app/uploads
mkdir -p /app/model-cache
chown -R nextjs:nodejs /app/uploads /app/model-cache
chmod 755 /app/uploads /app/model-cache

echo "[Entrypoint] Starting app as nextjs..."
exec gosu nextjs "$@"
