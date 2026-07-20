-- Add manual/date-based follow-up tables (FollowUpEntry + FollowUpReminderConfig).
--
-- These models exist in schema.prisma but were never migrated, so databases that
-- deploy via `prisma migrate deploy` (the project's production/self-host path,
-- see package.json "db:migrate") never got the tables. Every follow-up server
-- action then threw at runtime and the Follow-ups page hung on its loading
-- skeleton — i.e. the section "would not open".
--
-- Written idempotently (IF NOT EXISTS / guarded enum) so it applies cleanly on
-- top of databases that were previously bootstrapped with `prisma db push`,
-- matching the style of 20260617120000_add_social_messaging_tables.

-- ── FollowUpStatus enum ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpStatus') THEN
    CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'REMINDED', 'CONTACTED', 'CONVERTED', 'LOST');
  END IF;
END
$$;

-- Ensure every value exists even if an older/partial enum was already present.
ALTER TYPE "FollowUpStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "FollowUpStatus" ADD VALUE IF NOT EXISTS 'REMINDED';
ALTER TYPE "FollowUpStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "FollowUpStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "FollowUpStatus" ADD VALUE IF NOT EXISTS 'LOST';

-- ── FollowUpEntry ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FollowUpEntry" (
  "id"              SERIAL NOT NULL,
  "channel"         TEXT NOT NULL DEFAULT 'whatsapp',
  "contactId"       INTEGER,
  "socialContactId" TEXT,
  "displayName"     TEXT,
  "leadId"          INTEGER,
  "interest"        TEXT,
  "budget"          TEXT,
  "reason"          TEXT,
  "followUpDate"    TIMESTAMP(3) NOT NULL,
  "priority"        TEXT NOT NULL DEFAULT 'Medium',
  "source"          TEXT,
  "status"          "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "assignedToId"    INTEGER,
  "lastContactedAt" TIMESTAMP(3),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FollowUpEntry_status_idx" ON "FollowUpEntry" ("status");
CREATE INDEX IF NOT EXISTS "FollowUpEntry_followUpDate_idx" ON "FollowUpEntry" ("followUpDate");
CREATE INDEX IF NOT EXISTS "FollowUpEntry_contactId_idx" ON "FollowUpEntry" ("contactId");
CREATE INDEX IF NOT EXISTS "FollowUpEntry_socialContactId_idx" ON "FollowUpEntry" ("socialContactId");
CREATE INDEX IF NOT EXISTS "FollowUpEntry_leadId_idx" ON "FollowUpEntry" ("leadId");
CREATE INDEX IF NOT EXISTS "FollowUpEntry_assignedToId_idx" ON "FollowUpEntry" ("assignedToId");

-- Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS in Postgres).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FollowUpEntry_contactId_fkey') THEN
    ALTER TABLE "FollowUpEntry" ADD CONSTRAINT "FollowUpEntry_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FollowUpEntry_socialContactId_fkey') THEN
    ALTER TABLE "FollowUpEntry" ADD CONSTRAINT "FollowUpEntry_socialContactId_fkey"
      FOREIGN KEY ("socialContactId") REFERENCES "social_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FollowUpEntry_leadId_fkey') THEN
    ALTER TABLE "FollowUpEntry" ADD CONSTRAINT "FollowUpEntry_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FollowUpEntry_assignedToId_fkey') THEN
    ALTER TABLE "FollowUpEntry" ADD CONSTRAINT "FollowUpEntry_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ── FollowUpReminderConfig (singleton, id = 1) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "FollowUpReminderConfig" (
  "id"           INTEGER NOT NULL DEFAULT 1,
  "enabled"      BOOLEAN NOT NULL DEFAULT false,
  "templateName" TEXT,
  "language"     TEXT NOT NULL DEFAULT 'en_US',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowUpReminderConfig_pkey" PRIMARY KEY ("id")
);
