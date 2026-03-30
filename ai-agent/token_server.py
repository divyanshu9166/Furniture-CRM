"""
Development token server for browser-based testing of the AI agent.
Generates LiveKit access tokens so a browser client can connect to a room.
Run: python token_server.py
Then open http://localhost:8099 in your browser.
"""

import os
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler

from dotenv import load_dotenv
from livekit import api

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
API_KEY = os.getenv("LIVEKIT_API_KEY", "")
API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
PORT = 8099


class TokenHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

    def do_GET(self):
        if self.path == "/token":
            self.send_token()
        elif self.path == "/":
            self.path = "/test_call.html"
            super().do_GET()
        else:
            super().do_GET()

    def send_token(self):
        room_name = "browser-test"
        identity = "browser-user"

        token = api.AccessToken(API_KEY, API_SECRET)
        token.with_identity(identity)
        token.with_name("Browser Tester")
        token.with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
            )
        )

        jwt_token = token.to_jwt()

        response = json.dumps({
            "token": jwt_token,
            "url": LIVEKIT_URL,
            "room": room_name,
        })

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), TokenHandler)
    print(f"Token server running at http://localhost:{PORT}")
    print(f"LiveKit URL: {LIVEKIT_URL}")
    server.serve_forever()
