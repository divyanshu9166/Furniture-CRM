-- Additive only: preserve existing SMTP credentials, campaigns and recipients.
ALTER TABLE "StoreSettings"
  ADD COLUMN "smtpFromEmail" TEXT,
  ADD COLUMN "smtpAliases" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "EmailCampaign"
  ADD COLUMN "fromEmail" TEXT,
  ADD COLUMN "fromName" TEXT;
