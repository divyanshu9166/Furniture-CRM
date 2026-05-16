# Production Deployment Guide

This document outlines the steps to deploy the Furniture CRM to a VPS using Docker Compose, Nginx as a reverse proxy, and system cron for automated tasks.

## 1. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=furniturecrm

# Auth
NEXTAUTH_SECRET=your_nextauth_secret
CRM_API_SECRET=your_api_secret_for_cron
DOMAIN=my-crm-project.duckdns.org

# Cloudflare R2 Storage
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=furniture-crm
R2_PUBLIC_URL=https://pub-your-id.r2.dev

# AI / voice agent
AI_AGENT_NAME=anushka
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_MAX_OUTPUT_TOKENS=48
SARVAM_API_KEY=your_sarvam_key
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=pooja
SARVAM_TTS_PACE=1.03
SARVAM_TTS_TEMPERATURE=0.55
SARVAM_TTS_MIN_BUFFER_SIZE=20
SARVAM_TTS_MAX_CHUNK_LENGTH=80
VAD_MIN_SPEECH_DURATION=0.12
VAD_MIN_SILENCE_DURATION=0.25
VAD_PREFIX_PADDING_DURATION=0.20
VAD_ACTIVATION_THRESHOLD=0.62
AGENT_MIN_ENDPOINTING_DELAY=0.20
SESSION_MIN_ENDPOINTING_DELAY=0.20
SESSION_MIN_INTERRUPTION_DURATION=0.60
SESSION_MIN_INTERRUPTION_WORDS=2
LIVEKIT_URL=wss://your-client-project.livekit.cloud
LIVEKIT_API_KEY=your_client_livekit_api_key
LIVEKIT_API_SECRET=your_client_livekit_api_secret
OUTBOUND_SIP_TRUNK_ID=your_livekit_vobiz_outbound_trunk_id
VOBIZ_SIP_DOMAIN=your_vobiz_sip_domain_if_used_for_transfer
DEFAULT_TRANSFER_NUMBER=+91XXXXXXXXXX
```

## 2. Nginx Configuration

The server should have Nginx installed and configured to proxy requests to the Docker container.

### Example Nginx Server Block (`/etc/nginx/sites-available/my-crm-project.duckdns.org`)

```nginx
server {
    listen 80;
    server_name my-crm-project.duckdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name my-crm-project.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/my-crm-project.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/my-crm-project.duckdns.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 3. Automated Tasks (Cron)

Set up system cron jobs to trigger the CRM's internal alerts.

Run `crontab -e` and add the following:

```cron
# Stock alerts every morning at 9 AM
0 9 * * * curl -X GET -H "x-api-secret: your_api_secret_for_cron" https://my-crm-project.duckdns.org/api/cron/stock-alerts

# Financial alerts every morning at 10 AM
0 10 * * * curl -X GET -H "x-api-secret: your_api_secret_for_cron" https://my-crm-project.duckdns.org/api/cron/financial-alerts

# IndiaMART lead sync every 10 minutes
*/10 * * * * curl -X GET -H "x-api-secret: your_api_secret_for_cron" https://my-crm-project.duckdns.org/api/cron/indiamart-sync
```

## 4. Deployment Commands

```bash
# Build and start services
docker compose up -d --build

# View logs
docker compose logs -f app
```
