#!/bin/bash
# =====================================================================
# VPS .env Audit & Fix Script for Furniture CRM + AI Calling Agent
# Run this ON THE VPS: bash check-vps-env.sh
# =====================================================================

cd ~/Furniture-CRM || { echo "❌ Directory ~/Furniture-CRM not found!"; exit 1; }

ENV_FILE=".env"

echo "======================================================"
echo "  VPS .env Audit — Furniture CRM + AI Calling Agent"
echo "======================================================"
echo ""

# ── Helper ──────────────────────────────────────────────
check_var() {
    local key="$1"
    local val
    val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"')
    if [[ -z "$val" ]]; then
        echo "  ❌  MISSING / EMPTY  →  $key"
        return 1
    else
        # Mask value for security — show first 6 chars only
        local masked="${val:0:6}..."
        echo "  ✅  $key = $masked"
        return 0
    fi
}

# ── 1. LiveKit (mandatory for BOTH inbound & outbound) ──
echo "--- 1. LiveKit ---"
check_var LIVEKIT_URL
check_var LIVEKIT_API_KEY
check_var LIVEKIT_API_SECRET

# ── 2. SIP / Telephony ─────────────────────────────────
echo ""
echo "--- 2. SIP / Telephony ---"
check_var OUTBOUND_SIP_TRUNK_ID     # Also used for inbound dispatch in LiveKit
check_var VOBIZ_SIP_TRUNK_ID        # Alias (same value)
check_var VOBIZ_SIP_DOMAIN          # Used for call transfer
check_var DEFAULT_TRANSFER_NUMBER   # Human transfer fallback

# ── 3. STT — Deepgram ──────────────────────────────────
echo ""
echo "--- 3. STT — Deepgram ---"
check_var DEEPGRAM_API_KEY

# ── 4. LLM — Groq ──────────────────────────────────────
echo ""
echo "--- 4. LLM — Groq ---"
check_var GROQ_API_KEY
check_var GROQ_MODEL

# ── 5. TTS — Sarvam ────────────────────────────────────
echo ""
echo "--- 5. TTS — Sarvam ---"
check_var SARVAM_API_KEY
check_var SARVAM_TTS_LANGUAGE
check_var SARVAM_TTS_MODEL
check_var SARVAM_TTS_SPEAKER

# ── 6. CRM Integration ─────────────────────────────────
echo ""
echo "--- 6. CRM Integration ---"
check_var CRM_API_URL
check_var CRM_API_SECRET

# ── 7. Database ────────────────────────────────────────
echo ""
echo "--- 7. Database ---"
check_var DATABASE_URL
check_var POSTGRES_USER
check_var POSTGRES_PASSWORD
check_var POSTGRES_DB

# ── 8. Auth ────────────────────────────────────────────
echo ""
echo "--- 8. Auth ---"
check_var NEXTAUTH_SECRET
check_var NEXTAUTH_URL

# ── 9. Optional but recommended ────────────────────────
echo ""
echo "--- 9. Optional ---"
check_var GEMINI_API_KEY
check_var MAX_CALL_DURATION_SECONDS
check_var ENCRYPTION_KEY

echo ""
echo "======================================================"
echo "  Docker Service Status"
echo "======================================================"
docker compose ps

echo ""
echo "======================================================"
echo "  AI Agent Logs (last 50 lines)"
echo "======================================================"
docker compose logs ai-agent --tail=50

echo ""
echo "======================================================"
echo "  App Logs (last 20 lines)"
echo "======================================================"
docker compose logs app --tail=20
