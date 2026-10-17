-- Additive only. Existing SMTP credentials, campaigns and recipient history stay intact.
CREATE TABLE "SmtpSendingSafety" (
  "id" TEXT NOT NULL,
  "blockedAt" TIMESTAMP(3),
  "blockReason" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "nextAllowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resetAt" TIMESTAMP(3),
  "resetBy" TEXT,
  CONSTRAINT "SmtpSendingSafety_pkey" PRIMARY KEY ("id")
);
