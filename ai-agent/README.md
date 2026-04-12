Furzentic - AI Calling Agent

AI-powered voice agent for inbound and outbound customer calls using **LiveKit**, **Deepgram**, **Groq**, and **Twilio SIP**.

## Architecture

```
                         ┌─────────────────┐
  Customer Phone ──SIP──>│   Twilio SIP    │
                         │   Trunk         │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │   LiveKit Cloud  │
                         │   (Audio Room)   │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │              │
              ┌─────▼─────┐ ┌────▼────┐  ┌─────▼─────┐
              │ Deepgram   │ │  Groq   │  │ Deepgram  │
              │ STT        │ │  LLM    │  │ TTS       │
              │ (nova-2)   │ │(llama3) │  │(aura)     │
              └────────────┘ └─────────┘  └───────────┘
                                  │
                         ┌────────▼────────┐
                         │  Furniture CRM  │
                         │  (Next.js API)  │
                         │  PostgreSQL DB  │
                         └─────────────────┘
```

## Prerequisites

1. **Python 3.10+** installed
2. **LiveKit Cloud** account — https://cloud.livekit.io
3. **Deepgram** API key — https://console.deepgram.com
4. **Groq** API key — https://console.groq.com
5. **Twilio** account with SIP trunk — https://console.twilio.com

## Setup

### 1. Install Python dependencies

```bash
cd ai-agent
pip install -r requirements.txt
```

### 2. Configure environment variables

Edit the `.env` file in the project root (Furniture CRM directory):

```env
# LiveKit Cloud
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Deepgram (STT + TTS)
DEEPGRAM_API_KEY=your_deepgram_key

# Groq (LLM - uses llama-3.3-70b)
GROQ_API_KEY=your_groq_key

# Twilio SIP (for actual phone calls)
TWILIO_AUTH_TOKEN=your_twilio_auth_token
OUTBOUND_SIP_TRUNK_ID=your_sip_trunk_id
TWILIO_SIP_DOMAIN=your-domain.pstn.twilio.com
DEFAULT_TRANSFER_NUMBER=+91XXXXXXXXXX

# CRM API communication
CRM_API_SECRET=your-secret-key-change-this
CRM_API_URL=http://localhost:3000
```

### 3. Set up LiveKit SIP Trunk

1. Go to LiveKit Cloud dashboard
2. Create a new SIP Trunk
3. Configure it with your Twilio SIP credentials
4. Note the trunk ID and set it as `OUTBOUND_SIP_TRUNK_ID`

### 4. Set up Twilio

1. Create a Twilio account and get a phone number
2. Set up an Elastic SIP Trunk pointing to LiveKit
3. Configure the SIP trunk to route inbound calls to LiveKit

### 5. Update the database

```bash
# From the project root
npm run db:generate
npm run db:push
```

## Running

### Start the CRM (Next.js)

```bash
# From project root
npm run dev
```

### Start the AI Agent

```bash
# From ai-agent directory
cd ai-agent
python agent.py dev
```

The agent registers with LiveKit as `furniture-crm-agent` and waits for calls.

### Make an outbound call (CLI)

```bash
python make_call.py --to "+91XXXXXXXXXX" --reason "Follow up on sofa inquiry" --name "Rahul Sharma"
```

### Make an outbound call (CRM UI)

1. Go to **Call Center** > **AI Caller** tab
2. Enter the phone number, customer name, and reason
3. Click **Start AI Call**

### Browser voice test

1. Go to **Call Center** > **AI Caller** tab
2. Click **Start Browser Call**
3. Speak into your microphone

Or use the standalone test page:
```bash
cd ai-agent
python token_server.py
# Open http://localhost:8099
```

## How It Works

### Outbound Calls
1. CRM UI triggers `/api/calls/outbound`
2. API creates a LiveKit room and dispatches the agent
3. Agent dials the customer via Twilio SIP trunk
4. Deepgram converts speech-to-text
5. Groq LLM generates responses
6. Deepgram converts text-to-speech
7. When call ends, agent logs to CRM via `/api/calls/log`

### Inbound Calls
1. Customer calls your Twilio number
2. Twilio routes to LiveKit via SIP trunk
3. LiveKit dispatches the AI agent
4. Same STT → LLM → TTS pipeline
5. Agent can transfer to human via `transfer_call` tool
6. Call logged to CRM database on completion

### Browser Calls
1. CRM requests a LiveKit token via `/api/calls/token`
2. Browser connects to LiveKit room with microphone
3. Agent dispatched and handles the conversation
4. Call logged to CRM on disconnect

## Agent Persona

The AI agent is named **Aria** and handles:
- Product inquiries and pricing
- Appointment scheduling
- Delivery updates
- Complaint handling
- Feedback collection
- Order follow-ups

You can customize the persona by editing the system prompts in `agent.py`.

## Troubleshooting

- **"LiveKit not configured"**: Check that `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are set
- **Agent not answering**: Make sure `python agent.py dev` is running
- **No phone calls**: Verify Twilio SIP trunk configuration and `OUTBOUND_SIP_TRUNK_ID`
- **Browser call fails**: Check browser microphone permissions
- **Calls not logged**: Verify `CRM_API_SECRET` matches in both `.env` and the API route
