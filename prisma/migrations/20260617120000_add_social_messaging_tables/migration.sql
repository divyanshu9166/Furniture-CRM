-- Add Facebook Page & Instagram DM messaging tables.
--
-- These models exist in schema.prisma but were never migrated, so production
-- databases (which deploy via `prisma migrate deploy`) were missing them.
-- Without these tables, saving the FB/IG config and every webhook/inbox query
-- throws, which left the social inbox empty and the chatbot non-functional.
--
-- Idempotent (IF NOT EXISTS / guarded constraints) so it is safe to apply on
-- databases that were previously synced with `prisma db push`.

-- ── fb_config ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fb_config" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "page_name" TEXT,
  "page_access_token" TEXT NOT NULL,
  "app_secret" TEXT,
  "verify_token" TEXT,
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "connected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fb_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fb_config_user_id_key"
  ON "fb_config" ("user_id");

-- ── ig_config ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ig_config" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "ig_account_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "page_name" TEXT,
  "ig_username" TEXT,
  "page_access_token" TEXT NOT NULL,
  "app_secret" TEXT,
  "verify_token" TEXT,
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "connected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ig_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ig_config_user_id_key"
  ON "ig_config" ("user_id");

-- ── social_contacts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "social_contacts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "platform_id" TEXT NOT NULL,
  "name" TEXT,
  "profile_pic" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_contacts_user_id_platform_platform_id_key"
  ON "social_contacts" ("user_id", "platform", "platform_id");

CREATE INDEX IF NOT EXISTS "social_contacts_user_id_platform_idx"
  ON "social_contacts" ("user_id", "platform");

-- ── social_conversations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "social_conversations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "needs_human" BOOLEAN NOT NULL DEFAULT false,
  "last_message_text" TEXT,
  "last_message_at" TIMESTAMP(3),
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_conversations_user_id_contact_id_key"
  ON "social_conversations" ("user_id", "contact_id");

CREATE INDEX IF NOT EXISTS "social_conversations_user_id_platform_idx"
  ON "social_conversations" ("user_id", "platform");

CREATE INDEX IF NOT EXISTS "social_conversations_user_id_status_idx"
  ON "social_conversations" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "social_conversations_last_message_at_idx"
  ON "social_conversations" ("last_message_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_conversations_contact_id_fkey'
  ) THEN
    ALTER TABLE "social_conversations"
      ADD CONSTRAINT "social_conversations_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "social_contacts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── social_messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "social_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "platform_msg_id" TEXT,
  "sender_type" TEXT NOT NULL,
  "content_type" TEXT NOT NULL DEFAULT 'text',
  "content_text" TEXT,
  "media_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_messages_conversation_id_idx"
  ON "social_messages" ("conversation_id");

CREATE INDEX IF NOT EXISTS "social_messages_platform_msg_id_idx"
  ON "social_messages" ("platform_msg_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE "social_messages"
      ADD CONSTRAINT "social_messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "social_conversations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
