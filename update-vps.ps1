# update-vps.ps1 — Push .env + rebuild ai-agent on VPS via PowerShell SSH
# Run: powershell -ExecutionPolicy Bypass -File update-vps.ps1

$VPS_USER = "root"
$VPS_HOST = "161.248.163.188"
$VPS_DIR  = "~/Furniture-CRM"

Write-Host "=== Uploading .env to VPS ===" -ForegroundColor Cyan
scp .env "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/.env"
Write-Host "Done." -ForegroundColor Green

Write-Host ""
Write-Host "=== Rebuilding ai-agent container ===" -ForegroundColor Cyan
ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DIR} && docker compose up -d --build --no-deps ai-agent"
Write-Host "Done." -ForegroundColor Green

Write-Host ""
Write-Host "=== AI Agent logs (last 50 lines) ===" -ForegroundColor Cyan
ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DIR} && docker compose logs ai-agent --tail=50"

Write-Host ""
Write-Host "=== Checking VPS .env keys ===" -ForegroundColor Cyan
ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DIR} && for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET DEEPGRAM_API_KEY GROQ_API_KEY SARVAM_API_KEY OUTBOUND_SIP_TRUNK_ID VOBIZ_SIP_DOMAIN CRM_API_URL CRM_API_SECRET; do val=`grep -E '''^'$key'=''' .env | head -1 | cut -d= -f2-`; if [ -z `$val` ]; then echo '  MISSING: '$key; else echo '  OK: '$key; fi; done"
