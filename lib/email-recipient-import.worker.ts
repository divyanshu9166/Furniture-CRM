import { parseRecipientFile } from './email-recipient-import'

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer; filename: string }>) => {
  try { self.postMessage({ success: true, data: parseRecipientFile(new Uint8Array(event.data.bytes), event.data.filename) }) }
  catch (error) { self.postMessage({ success: false, error: error instanceof Error ? error.message : 'Unable to read recipient file.' }) }
}
