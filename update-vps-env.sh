#!/bin/bash
# =====================================================================
# update-vps-env.sh  — Push the complete .env to VPS and redeploy
#
# Run from your LOCAL machine (Windows Git Bash / WSL):
#   bash update-vps-env.sh
#
# Prerequisites: SSH access to VPS, docker compose running there.
# =====================================================================

set -e

VPS_USER="root"          # Change if your VPS user is different
VPS_HOST="161.248.163.188"
VPS_DIR="~/Furniture-CRM"

echo "=== Pushing updated .env to VPS ==="
scp .env ${VPS_USER}@${VPS_HOST}:${VPS_DIR}/.env
echo "✓ .env uploaded"

echo ""
echo "=== Rebuilding & restarting ai-agent container ==="
ssh ${VPS_USER}@${VPS_HOST} "cd ${VPS_DIR} && docker compose up -d --build --no-deps ai-agent"
echo "✓ ai-agent restarted"

echo ""
echo "=== AI Agent logs (live — Ctrl+C to exit) ==="
ssh ${VPS_USER}@${VPS_HOST} "cd ${VPS_DIR} && docker compose logs -f ai-agent"
