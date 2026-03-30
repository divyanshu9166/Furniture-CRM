"""
Quick diagnostic to test the SIP trunk and LiveKit connection.
Run: python test_sip.py
"""
import asyncio
import os
import json
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from livekit import api

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
SIP_TRUNK_ID = os.getenv("OUTBOUND_SIP_TRUNK_ID")
TEST_PHONE = os.getenv("DEFAULT_TRANSFER_NUMBER", "")

async def main():
    print("=== LiveKit SIP Diagnostic ===\n")
    print(f"LiveKit URL:    {LIVEKIT_URL}")
    print(f"SIP Trunk ID:   {SIP_TRUNK_ID}")
    print(f"Test Phone:     {TEST_PHONE}")
    print()

    lk = api.LiveKitAPI(
        url=LIVEKIT_URL,
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET,
    )

    # 1. List SIP trunks
    print("--- Step 1: Listing SIP Outbound Trunks ---")
    try:
        trunks = await lk.sip.list_sip_outbound_trunk(api.ListSIPOutboundTrunkRequest())
        if trunks.items:
            for t in trunks.items:
                print(f"  Trunk: {t.sid} | Name: {t.name}")
                print(f"    Address: {t.address}")
                print(f"    Numbers: {list(t.numbers)}")
        else:
            print("  ⚠  No SIP outbound trunks found! Create one in LiveKit Cloud dashboard → SIP → Outbound Trunks")
    except Exception as e:
        print(f"  ERROR listing trunks: {e}")

    print()

    # 2. List active rooms
    print("--- Step 2: Active Rooms ---")
    try:
        rooms = await lk.room.list_rooms(api.ListRoomsRequest())
        if rooms.rooms:
            for r in rooms.rooms:
                print(f"  Room: {r.name} | Participants: {r.num_participants}")
        else:
            print("  No active rooms")
    except Exception as e:
        print(f"  ERROR listing rooms: {e}")

    print()

    # 3. Try a test SIP call to your own number
    if SIP_TRUNK_ID and TEST_PHONE:
        print(f"--- Step 3: Test SIP call to {TEST_PHONE} ---")
        print("  Creating test room...")
        try:
            room_name = "sip-test-room"
            await lk.room.create_room(api.CreateRoomRequest(name=room_name, empty_timeout=60))
            print(f"  Room created: {room_name}")

            print(f"  Dialing {TEST_PHONE} via trunk {SIP_TRUNK_ID}...")
            print("  (Your phone should ring within 5-10 seconds)")
            result = await lk.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=room_name,
                    sip_trunk_id=SIP_TRUNK_ID,
                    sip_call_to=TEST_PHONE,
                    wait_until_answered=False,  # Don't block — just dial
                )
            )
            print(f"  SIP participant created: {result}")
            print()
            print("  [OK] SIP dial dispatched. Did your phone ring?")
            print("  If not, check:")
            print("    1. LiveKit Cloud dashboard > SIP > your trunk has correct Twilio credentials")
            print("    2. Twilio SIP Trunk > Origination > points to LiveKit SIP URI")
            print("    3. Phone number format must be E.164: +91XXXXXXXXXX")

            # Cleanup
            await asyncio.sleep(5)
            await lk.room.delete_room(api.DeleteRoomRequest(room=room_name))
        except Exception as e:
            print(f"  ERROR during SIP test: {type(e).__name__}: {e}")
            print()
            print("  Likely causes:")
            print("    - SIP trunk not properly configured in LiveKit Cloud")
            print("    - Twilio credentials on the trunk are wrong")
            print("    - SIP trunk ID is invalid or belongs to another project")
    else:
        print("--- Step 3: Skipped (no SIP_TRUNK_ID or TEST_PHONE set) ---")

    await lk.aclose()
    print("\n=== Done ===")

asyncio.run(main())
