#!/bin/bash
set -e

cd ~/Furniture-CRM

echo "=== Creating .env file ==="
cat > .env << 'ENVEOF'
# Database
DATABASE_URL=${DATABASE_URL}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB:-furniturecrm}

# Session & Security
SESSION_SECRET=${SESSION_SECRET}
DOMAIN=${DOMAIN:-161.248.163.188}

# AI / Voice Services
LIVEKIT_URL=${LIVEKIT_URL}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}

DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
NVIDIA_API_KEY=${NVIDIA_API_KEY}
ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
ELEVEN_API_KEY=${ELEVEN_API_KEY}
ELEVENLABS_VOICE_ID=${ELEVENLABS_VOICE_ID}

TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}

GROQ_API_KEY=${GROQ_API_KEY}

AIRTABLE_PAT=${AIRTABLE_PAT}
AIRTABLE_BASE_ID=${AIRTABLE_BASE_ID}
AIRTABLE_TABLE_NAME=${AIRTABLE_TABLE_NAME:-call_logs}

MAX_CALL_DURATION_SECONDS=${MAX_CALL_DURATION_SECONDS:-600}

# R2 / Storage
CRM_API_SECRET=${CRM_API_SECRET}
R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
R2_BUCKET_NAME=${R2_BUCKET_NAME:-furniture-crm}
R2_PUBLIC_URL=${R2_PUBLIC_URL}

# Gemini / AI
GEMINI_API_KEY=${GEMINI_API_KEY}
ENVEOF

echo "✓ .env file created"
echo ""
echo "=== Stopping old containers ==="
docker compose down || true

echo ""
echo "=== Building and starting services ==="
docker compose up -d --build

echo ""
echo "=== Waiting for services (40s) ==="
sleep 40

echo ""
echo "=== SERVICE STATUS ==="
docker compose ps

echo ""
echo "=== CHECKING LOGS ==="
echo "--- Migrate logs: ---"
docker compose logs migrate --tail=30 || true

echo ""
echo "--- App logs: ---"
docker compose logs app --tail=50 || true

echo ""
echo "✓ Fix completed! Waiting 10s more for stability..."
sleep 10

echo ""
echo "=== FINAL CHECK ==="
docker compose ps
