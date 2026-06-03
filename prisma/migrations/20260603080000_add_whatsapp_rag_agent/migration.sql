-- Add WhatsApp RAG agent tables and pgvector support.
-- Idempotent so it can be deployed safely on databases that were previously updated with db push.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    ALTER TABLE "conversations"
      ADD COLUMN IF NOT EXISTS "needs_human" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "assigned_agent_id" TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wa_agent_configs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "agent_name" TEXT NOT NULL DEFAULT 'Assistant',
  "system_prompt" TEXT NOT NULL,
  "fallback_message" TEXT NOT NULL DEFAULT 'Let me connect you with our team.',
  "confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
  "max_response_tokens" INTEGER NOT NULL DEFAULT 300,
  "response_delay_ms" INTEGER NOT NULL DEFAULT 1500,
  "languages" TEXT[] NOT NULL DEFAULT ARRAY['en', 'hi']::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wa_agent_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wa_agent_configs_user_id_key"
  ON "wa_agent_configs" ("user_id");

CREATE TABLE IF NOT EXISTS "wa_knowledge_docs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_type" TEXT NOT NULL DEFAULT 'text',
  "raw_text" TEXT NOT NULL,
  "char_count" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wa_knowledge_docs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wa_knowledge_docs_user_id_idx"
  ON "wa_knowledge_docs" ("user_id");

CREATE TABLE IF NOT EXISTS "wa_knowledge_chunks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "doc_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(768),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wa_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wa_knowledge_chunks"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wa_knowledge_chunks_doc_id_fkey'
  ) THEN
    ALTER TABLE "wa_knowledge_chunks"
      ADD CONSTRAINT "wa_knowledge_chunks_doc_id_fkey"
      FOREIGN KEY ("doc_id") REFERENCES "wa_knowledge_docs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "wa_knowledge_chunks_user_id_idx"
  ON "wa_knowledge_chunks" ("user_id");

CREATE INDEX IF NOT EXISTS "wa_knowledge_chunks_doc_id_idx"
  ON "wa_knowledge_chunks" ("doc_id");

CREATE INDEX IF NOT EXISTS "wa_knowledge_chunks_embedding_idx"
  ON "wa_knowledge_chunks"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
