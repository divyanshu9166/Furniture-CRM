"""
setup_inbound_dispatch.py
─────────────────────────
Creates a SIP Dispatch Rule in LiveKit so that inbound calls
(someone calling the Vobiz/SIP number) are automatically routed
to the 'furniture-crm-agent' AI worker.

Run once from the VPS (or your local machine) after setting up
the inbound SIP trunk in LiveKit Cloud dashboard:

    python setup_inbound_dispatch.py

Prerequisites:
  • An INBOUND SIP Trunk must already exist in LiveKit Cloud.
    (SIP → Trunks → + New Trunk → Inbound)
    Set the trunk to receive calls at your Vobiz DID number.
  • LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in .env
  • INBOUND_SIP_TRUNK_ID in .env  (the ID of the inbound trunk,
    format: ST_xxxxxxxxxxxx — different from the outbound trunk!)
"""

import asyncio
import os
from dotenv import load_dotenv
from livekit import api

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


async def main():
    lk_url    = os.getenv("LIVEKIT_URL")
    lk_key    = os.getenv("LIVEKIT_API_KEY")
    lk_secret = os.getenv("LIVEKIT_API_SECRET")

    # The INBOUND SIP trunk ID — set this in .env as INBOUND_SIP_TRUNK_ID
    # It is DIFFERENT from OUTBOUND_SIP_TRUNK_ID
    inbound_trunk_id = os.getenv("INBOUND_SIP_TRUNK_ID") or os.getenv("VOBIZ_SIP_TRUNK_ID")

    if not all([lk_url, lk_key, lk_secret]):
        print("❌ LiveKit credentials missing. Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env")
        return

    if not inbound_trunk_id:
        print("❌ INBOUND_SIP_TRUNK_ID missing in .env")
        print("   Go to LiveKit Cloud → SIP → Trunks → create an Inbound trunk")
        print("   then add INBOUND_SIP_TRUNK_ID=ST_xxxx to your .env")
        return

    lkapi = api.LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret)

    print(f"LiveKit URL     : {lk_url}")
    print(f"Inbound Trunk   : {inbound_trunk_id}")
    print(f"Agent Name      : furniture-crm-agent")
    print()

    try:
        # List existing dispatch rules so we don't duplicate
        existing = await lkapi.sip.list_sip_dispatch_rule(
            api.ListSIPDispatchRuleRequest()
        )
        if existing.items:
            print(f"Existing dispatch rules ({len(existing.items)}):")
            for rule in existing.items:
                print(f"  • {rule.sip_dispatch_rule_id} — trunk: {rule.trunk_ids}")
            print()
            ans = input("A dispatch rule already exists. Create another one? (y/N): ").strip().lower()
            if ans != "y":
                print("Skipped. Using existing rule.")
                await lkapi.aclose()
                return

        # Create a dispatch rule: all inbound calls → agent "furniture-crm-agent"
        # The metadata is passed to the agent entrypoint as ctx.job.metadata
        rule = await lkapi.sip.create_sip_dispatch_rule(
            api.CreateSIPDispatchRuleRequest(
                trunk_ids=[inbound_trunk_id],
                rule=api.SIPDispatchRule(
                    dispatch_rule_direct=api.SIPDispatchRuleDirect(
                        room_prefix="inbound-",
                        pin="",   # No PIN required
                    )
                ),
                room_preset="",
                attributes={},
                hide_phone_number=False,
                # Route to our named agent worker
                inbound_numbers=[],   # Empty = match all numbers on this trunk
                dispatch=api.RoomAgentDispatch(
                    agent_name="furniture-crm-agent",
                    metadata='{"call_type": "inbound"}',
                ),
            )
        )

        print(f"✅ Dispatch rule created!")
        print(f"   Rule ID   : {rule.sip_dispatch_rule_id}")
        print(f"   Trunk IDs : {rule.trunk_ids}")
        print()
        print("Now inbound SIP calls will be automatically dispatched to 'furniture-crm-agent'.")
        print("Make sure the agent worker is running on VPS: docker compose logs ai-agent")

    except Exception as exc:
        print(f"❌ Error: {exc}")
        import traceback
        traceback.print_exc()
    finally:
        await lkapi.aclose()


if __name__ == "__main__":
    asyncio.run(main())
