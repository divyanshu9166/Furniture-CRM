import { RoomServiceClient, SipClient } from 'livekit-server-sdk';

const livekitHost = process.env.LIVEKIT_URL || '';
const apiKey = process.env.LIVEKIT_API_KEY || '';
const apiSecret = process.env.LIVEKIT_API_SECRET || '';

export const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
export const sipClient = new SipClient(livekitHost, apiKey, apiSecret);
