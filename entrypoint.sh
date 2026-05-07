#!/bin/sh
# Fix permissions on the uploads directory before starting.
# Docker named volumes are owned by root on first creation.
# This script runs as root, fixes ownership, then drops to nextjs user.
set -e

echo "[Entrypoint] Ensuring /app/uploads is writable by nextjs..."
mkdir -p /app/uploads
chown -R nextjs:nodejs /app/uploads
chmod 755 /app/uploads

echo "[Entrypoint] Starting app as nextjs..."
exec su-exec nextjs "$@"
