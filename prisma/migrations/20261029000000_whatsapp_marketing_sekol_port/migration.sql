-- WhatsApp Marketing upgrade (ported from the Sekol CRM): delivery failure
-- reasons, marketing opt-outs, Meta template IDs, saved webhook App Secret and
-- server-side broadcast sending. IF NOT EXISTS keeps this safe to re-run.

-- Why an outgoing WhatsApp message failed, marketing opt-outs, and why Meta
-- rejected or paused a template.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "opted_out_at" TIMESTAMP(3);
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "status_reason" TEXT;

-- Meta's ID for a message template, saved when the CRM submits it for review
-- or syncs it from WhatsApp Manager.
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "meta_template_id" TEXT;

-- Let the Meta App Secret be saved from WhatsApp Marketing Settings (encrypted
-- with ENCRYPTION_KEY). When empty, META_APP_SECRET is used.
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "app_secret" TEXT;

-- Broadcasts are now sent by a server-side queue worker, so the media header
-- and the reason a whole broadcast failed are stored on the broadcast.
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "header_media" JSONB;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "error_message" TEXT;

-- Header {{1}}, location pin, website link endings and offer code for a
-- broadcast template: the same for every recipient.
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "template_extras" JSONB;

-- Broadcasts the old in-browser sender left unfinished must not be picked up
-- by the new worker: it would re-send them at a random time, and without the
-- header photo they were created with. Close them out instead.
UPDATE "broadcast_recipients"
SET "status" = 'skipped',
    "error_message" = 'Not sent: this broadcast was interrupted before the switch to server-side sending.'
WHERE "status" = 'pending'
  AND "broadcast_id" IN (SELECT "id" FROM "broadcasts" WHERE "status" IN ('sending', 'scheduled'));

UPDATE "broadcasts"
SET "status" = 'failed',
    "error_message" = 'Stopped: this broadcast was being sent from a browser tab and did not finish. Recipients not yet sent to were skipped. Create a new broadcast to reach them.'
WHERE "status" IN ('sending', 'scheduled');
