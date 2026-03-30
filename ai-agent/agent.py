"""
Furniture CRM AI Calling Agent (livekit-agents v1.5.x)
Uses LiveKit + Deepgram STT/TTS + Groq LLM + Twilio SIP
Handles both inbound and outbound calls for furniture businesses
"""

import asyncio
import json
import logging
import os
import time
from typing import Optional

import aiohttp
from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    RoomInputOptions,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import deepgram, noise_cancellation, openai, silero

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger("furniture-crm-agent")
logger.setLevel(logging.INFO)

# ─── Config ───
CRM_API_URL = os.getenv("CRM_API_URL", "http://localhost:3000")
CRM_API_SECRET = os.getenv("CRM_API_SECRET", "")
MAX_CALL_DURATION = int(os.getenv("MAX_CALL_DURATION_SECONDS", "600"))
DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER", "")
OUTBOUND_SIP_TRUNK_ID = os.getenv("OUTBOUND_SIP_TRUNK_ID", "")

# ─── System prompts ───
INBOUND_SYSTEM_PROMPT = """\
# Identity
You are Aria, a warm and professional customer representative for a furniture store.
You are handling an inbound call from a customer who called you.

# Capabilities
- Answer questions about furniture products, pricing, availability, and delivery
- Schedule showroom visits, measurement appointments, and design consultations
- Handle complaints and escalate urgent issues to a human agent
- Collect customer details for follow-ups and quotations
- Provide order status updates

# Behaviour Rules
1. Greet the customer warmly and ask how you can help.
2. Confirm the customer's name early in the call.
3. NEVER fabricate prices or delivery commitments.
4. If asked something outside your knowledge, offer to have a team member call back.
5. If the customer asks for a human, call the transfer_call tool immediately.
6. When the conversation is complete, call the end_call tool.
7. Always close warmly — thank them and wish them a lovely day.
8. Keep responses concise — 1 to 3 sentences per turn.
9. When scheduling an appointment: ask for each detail ONE AT A TIME — phone number, date, time. Once you have ALL details confirmed, THEN call schedule_appointment. NEVER call it with "unknown" or missing values.
"""

OUTBOUND_SYSTEM_PROMPT = """\
# Identity
You are Aria, a warm and professional customer representative for a furniture store.
You are making an outbound call to a customer — you called them, so respect their time.

# Capabilities
- Follow up on previous inquiries, quotes, or showroom visits
- Remind customers about upcoming appointments or deliveries
- Collect feedback on recent purchases
- Inform about new collections, sales, or promotions
- Schedule showroom visits or design consultations

# Behaviour Rules
1. Introduce yourself immediately: name, store, reason for call.
2. Confirm you are speaking to the right person before proceeding.
3. NEVER fabricate prices or delivery commitments.
4. If the customer is busy, offer to call back at a convenient time.
5. If the customer asks for a human, call the transfer_call tool immediately.
6. When the conversation is complete, call the end_call tool.
7. Always close warmly — thank them and wish them a lovely day.
8. Keep responses concise — 1 to 3 sentences per turn.
9. When scheduling an appointment: ask for each detail ONE AT A TIME — phone number, date, time. Once you have ALL details confirmed, THEN call schedule_appointment. NEVER call it with "unknown" or missing values.
"""

OUTBOUND_GREETING_PROMPT = (
    "The customer has just answered the phone. "
    "Introduce yourself immediately: 'Hi, this is Aria calling from the furniture store. "
    "I'm calling today to [state the reason briefly]. Is now a good time to chat?' "
    "Be warm, natural, and brief. Reason for call: {reason}"
)


# ─── Tools ───

class FurnitureCRMTools(llm.ToolContext):
    def __init__(self, ctx: JobContext, phone_number: Optional[str] = None) -> None:
        super().__init__(tools=[])
        self._ctx = ctx
        self._phone_number = phone_number

    @llm.function_tool(
        description="Transfer the call to a human team member. Call this immediately when the customer requests to speak to a person."
    )
    async def transfer_call(self, destination: Optional[str] = None) -> str:
        target = destination or DEFAULT_TRANSFER_NUMBER
        if not target:
            return "No transfer number configured. Apologise and offer to have someone call them back."

        sip_domain = os.getenv("TWILIO_SIP_DOMAIN", "")
        if sip_domain and not target.startswith("sip:"):
            clean = target.replace("tel:", "").replace("sip:", "").replace(" ", "")
            target = f"sip:{clean}@{sip_domain}"
        elif not target.startswith(("sip:", "tel:")):
            target = f"tel:{target}"

        participant_identity = f"sip_{self._phone_number}" if self._phone_number else None
        if not participant_identity:
            for p in self._ctx.room.remote_participants.values():
                participant_identity = p.identity
                break

        if not participant_identity:
            return "Transfer failed: could not identify the remote participant."

        try:
            await self._ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self._ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=target,
                    play_dialtone=False,
                )
            )
            return "Transfer initiated successfully."
        except Exception as exc:
            logger.error("Transfer failed: %s", exc)
            return f"Transfer failed: {exc}"

    @llm.function_tool(
        description=(
            "Schedule a showroom visit or appointment for the customer. "
            "Only call this tool AFTER you have collected and verbally confirmed with the customer: "
            "their full name, phone number (digits only, e.g. +919876543210), "
            "date in YYYY-MM-DD format, and time (e.g. '11:00 AM'). "
            "NEVER call this with placeholder values like 'unknown'."
        )
    )
    async def schedule_appointment(
        self,
        customer_name: str,
        phone: str,
        date: str,
        time: str,
        purpose: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> str:
        # Guard against placeholder values the LLM sometimes sends
        invalid = {"unknown", "none", "n/a", "tbd", "", "null"}
        if any(v.strip().lower() in invalid for v in [customer_name, phone, date, time]):
            return (
                "I'm missing some details. Please ask the customer for their "
                "phone number, preferred date (in YYYY-MM-DD format), and time before calling this tool."
            )

        payload = {
            "customerName": customer_name,
            "phone": phone,
            "date": date,
            "time": time,
            "purpose": purpose or "Showroom Visit",
            "notes": notes or f"Booked via AI Agent (Aria) during call",
        }
        try:
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    f"{CRM_API_URL}/api/appointments/create",
                    json=payload,
                    headers={"Content-Type": "application/json", "x-api-secret": CRM_API_SECRET},
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        appt_id = result.get("data", {}).get("id")
                        logger.info("Appointment created: id=%s date=%s time=%s", appt_id, date, time)
                        return (
                            f"Appointment confirmed and saved successfully. "
                            f"{purpose or 'Showroom Visit'} on {date} at {time} for {customer_name}."
                        )
                    else:
                        text = await resp.text()
                        logger.error("Appointment creation failed (%s): %s", resp.status, text)
                        return "I was unable to save the appointment due to a system error. Please ask the customer to call back to confirm."
        except Exception as exc:
            logger.error("schedule_appointment error: %s", exc)
            return "There was a technical issue saving the appointment. Please ask the customer to call back to confirm."

    @llm.function_tool(
        description="End the call politely once the conversation is complete. Always say goodbye before calling this."
    )
    async def end_call(self) -> str:
        logger.info("end_call tool invoked — shutting down.")
        self._ctx.shutdown()
        return "Call ended."


# ─── CRM logging ───

async def log_call_to_crm(
    called_number: str,
    duration_seconds: float,
    transcript: str,
    call_type: str = "outbound",
    purpose: str = "",
    outcome: str = "",
    customer_name: str = "",
) -> None:
    payload = {
        "customerName": customer_name or "Unknown Customer",
        "phone": called_number or "Unknown",
        "direction": "INBOUND" if call_type == "inbound" else "OUTBOUND",
        "status": "COMPLETED",
        "durationSec": round(duration_seconds),
        "agent": "AI Agent - Aria",
        "purpose": purpose or f"AI {call_type} call",
        "outcome": outcome or "Completed",
        "notes": f"AI-handled {call_type} call",
        "recording": False,
        "transcript": transcript,
        "callType": f"ai_{call_type}",
    }
    try:
        async with aiohttp.ClientSession() as http:
            async with http.post(
                f"{CRM_API_URL}/api/calls/log",
                json=payload,
                headers={"Content-Type": "application/json", "x-api-secret": CRM_API_SECRET},
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    logger.info("Call logged to CRM: id=%s", result.get("data", {}).get("id"))
                else:
                    logger.error("CRM log failed (%s): %s", resp.status, await resp.text())
    except Exception as e:
        logger.error("Failed to log call to CRM: %s", e)


# ─── Worker ───

def prewarm(proc: JobProcess) -> None:
    # Load with telephony-tuned settings: higher threshold + longer silence to
    # avoid SIP background noise triggering false interruptions
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.2,
        min_silence_duration=0.5,
        prefix_padding_duration=0.3,
        activation_threshold=0.65,
    )
    logger.info("Silero VAD pre-warmed (telephony profile).")


async def entrypoint(ctx: JobContext) -> None:
    # Parse metadata
    phone_number: Optional[str] = None
    call_reason = "follow-up"
    call_type = "outbound"
    customer_name = ""

    try:
        if ctx.job.metadata:
            meta = json.loads(ctx.job.metadata)
            raw_phone = meta.get("phone_number", "")
            phone_number = raw_phone.replace(" ", "") if raw_phone else None
            call_reason = meta.get("reason", "follow-up")
            call_type = meta.get("call_type", "outbound")
            customer_name = meta.get("customer_name", "")
    except Exception:
        logger.warning("No valid JSON metadata — browser test mode.")

    logger.info("Job started | type=%s | number=%s | reason=%s", call_type, phone_number or "WEB-TEST", call_reason)

    # Connect to LiveKit room
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Connected to room: %s", ctx.room.name)

    call_start = time.time()
    transcript_lines: list[str] = []

    # VAD — use prewarm instance (telephony-tuned settings already applied)
    vad_instance = ctx.proc.userdata.get("vad") or silero.VAD.load(
        min_speech_duration=0.2,
        min_silence_duration=0.5,
        prefix_padding_duration=0.3,
        activation_threshold=0.65,
    )

    # Tools
    tools_ctx = FurnitureCRMTools(ctx, phone_number)

    # System prompt
    system_prompt = OUTBOUND_SYSTEM_PROMPT if call_type == "outbound" else INBOUND_SYSTEM_PROMPT

    # LLM
    groq_key = os.getenv("GROQ_API_KEY", "")
    llm_instance = openai.LLM(
        model="llama-3.3-70b-versatile",
        base_url="https://api.groq.com/openai/v1",
        api_key=groq_key,
        temperature=0.4,  # lower = more reliable tool call JSON
    ) if groq_key else openai.LLM(model="gpt-4o-mini")

    # Build agent — no VAD here; session owns VAD to avoid double processing
    agent = Agent(
        instructions=system_prompt,
        stt=deepgram.STT(model="nova-2", language="en"),
        llm=llm_instance,
        tts=deepgram.TTS(model="aura-asteria-en"),
        tools=list(tools_ctx.function_tools.values()),
        allow_interruptions=True,
        min_endpointing_delay=0.5,  # 500ms — comfortable pause for phone lines
    )

    # Build session — VAD lives here only
    session = AgentSession(
        vad=vad_instance,
        allow_interruptions=True,
        min_interruption_duration=1.2,   # require 1.2s of speech before interrupting
        min_interruption_words=3,        # require 3 words before interrupting
        min_endpointing_delay=0.5,       # match agent setting
    )

    # Transcript collector
    @session.on("conversation_item_added")
    def on_item(ev) -> None:
        msg = ev.item
        if not isinstance(msg, llm.ChatMessage):
            return
        text = (msg.text_content or "").strip()
        if not text:
            return
        if msg.role == "user":
            transcript_lines.append(f"Customer: {text}")
            logger.info("Customer: %s", text)
        elif msg.role == "assistant":
            transcript_lines.append(f"Agent: {text}")
            logger.info("Aria: %s", text)

    session_closed = asyncio.Event()

    @session.on("close")
    def on_close(ev) -> None:
        logger.info("Session closed.")
        session_closed.set()

    # Start session FIRST — before dialing
    await session.start(
        agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True,
        ),
    )
    logger.info("Voice pipeline ready.")

    # Outbound: dial customer, wait for answer, then greet
    if call_type == "outbound" and phone_number and OUTBOUND_SIP_TRUNK_ID:
        logger.info("Dialling %s via trunk %s ...", phone_number, OUTBOUND_SIP_TRUNK_ID)
        try:
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=OUTBOUND_SIP_TRUNK_ID,
                    sip_call_to=phone_number,
                    participant_identity=f"sip_{phone_number}",
                    wait_until_answered=True,  # block until customer picks up
                )
            )
            logger.info("Call answered — generating greeting.")
            await session.generate_reply(
                instructions=OUTBOUND_GREETING_PROMPT.format(reason=call_reason)
            )
        except Exception as exc:
            logger.error("Outbound call failed: %s", exc)
            ctx.shutdown()
            return

    elif call_type == "outbound" and not OUTBOUND_SIP_TRUNK_ID:
        logger.error("OUTBOUND_SIP_TRUNK_ID not set — cannot dial.")
        ctx.shutdown()
        return

    else:
        # Inbound or browser test — participant already in room
        logger.info("Inbound/browser mode — waiting for participant...")
        await ctx.wait_for_participant()
        session.say("Hello! Thank you for calling. I'm Aria, your furniture store assistant. How can I help you today?", allow_interruptions=True)

    # Max duration guard
    async def enforce_max_duration() -> None:
        await asyncio.sleep(MAX_CALL_DURATION)
        logger.warning("Max call duration reached — ending call.")
        session.say(
            "I'm sorry, we've reached the maximum call duration. Please don't hesitate to call us back. Have a wonderful day — goodbye!",
            allow_interruptions=False,
        )
        await asyncio.sleep(6)
        ctx.shutdown()

    max_duration_task = asyncio.create_task(enforce_max_duration())

    # Wait for session to close
    try:
        await session_closed.wait()
    finally:
        max_duration_task.cancel()
        call_duration = time.time() - call_start
        full_transcript = "\n".join(transcript_lines)
        logger.info("Call ended | duration=%.1fs | lines=%d", call_duration, len(transcript_lines))

        await log_call_to_crm(
            called_number=phone_number or "web-test",
            duration_seconds=call_duration,
            transcript=full_transcript,
            call_type=call_type,
            purpose=call_reason,
            customer_name=customer_name,
        )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="furniture-crm-agent",
        ),
    )
