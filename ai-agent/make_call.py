"""
CLI tool to trigger outbound AI calls from the Furniture CRM.
Usage: python make_call.py --to +91XXXXXXXXXX --reason "Follow up on sofa inquiry" --name "Rahul Sharma"
"""

import argparse
import asyncio
import os
import uuid

from dotenv import load_dotenv
from livekit import api

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


async def make_outbound_call(phone_number: str, reason: str, customer_name: str = ""):
    """Dispatch an outbound call via LiveKit agent."""
    lk_api = api.LiveKitAPI(
        url=os.getenv("LIVEKIT_URL"),
        api_key=os.getenv("LIVEKIT_API_KEY"),
        api_secret=os.getenv("LIVEKIT_API_SECRET"),
    )

    room_name = f"outbound-{uuid.uuid4().hex[:8]}"

    # Create the room
    await lk_api.room.create_room(
        api.CreateRoomRequest(name=room_name)
    )

    # Dispatch the agent with call metadata
    import json
    metadata = json.dumps({
        "call_type": "outbound",
        "phone_number": phone_number,
        "reason": reason,
        "customer_name": customer_name,
    })

    await lk_api.agent_dispatch.create_dispatch(
        api.CreateAgentDispatchRequest(
            room=room_name,
            agent_name="furniture-crm-agent",
            metadata=metadata,
        )
    )

    print(f"Outbound call dispatched!")
    print(f"  Room: {room_name}")
    print(f"  To: {phone_number}")
    print(f"  Reason: {reason}")
    if customer_name:
        print(f"  Customer: {customer_name}")

    await lk_api.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Make an outbound AI call")
    parser.add_argument("--to", required=True, help="Phone number with country code (e.g., +91XXXXXXXXXX)")
    parser.add_argument("--reason", required=True, help="Reason for the call")
    parser.add_argument("--name", default="", help="Customer name (optional)")
    args = parser.parse_args()

    asyncio.run(make_outbound_call(args.to, args.reason, args.name))
