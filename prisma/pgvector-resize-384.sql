-- pgvector-resize-384.sql
--
-- Run this ONCE on databases that already have embedding vector(768) from
-- the old Gemini setup. It safely resizes the column to 384 dims (required
-- for Xenova/multilingual-e5-small), drops the stale 768-dim index, and
-- re-creates a fresh 384-dim IVFFlat index.
--
-- After running this script, re-index all knowledge docs via the dashboard
-- (Settings → AI Agent → Knowledge Base → re-upload or trigger re-index),
-- because the old 768-dim Gemini embeddings are incompatible with 384-dim e5.
--
-- Command:
--   npx prisma db execute --file prisma/pgvector-resize-384.sql

BEGIN;

-- 1. Drop the old IVFFlat index (tied to the 768-dim type)
DROP INDEX IF EXISTS wa_knowledge_chunks_embedding_idx;

-- 2. Remove the old 768-dim column
ALTER TABLE wa_knowledge_chunks DROP COLUMN IF EXISTS embedding;

-- 3. Add the new 384-dim column (multilingual-e5-small output)
ALTER TABLE wa_knowledge_chunks ADD COLUMN embedding vector(384);

-- 4. Null out any stale data (column is fresh anyway, but belt-and-suspenders)
UPDATE wa_knowledge_chunks SET embedding = NULL;

-- 5. Re-create IVFFlat cosine index for the new dimension
CREATE INDEX wa_knowledge_chunks_embedding_idx
  ON wa_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 6. Mark all docs as pending so the worker will re-embed them
UPDATE wa_knowledge_docs SET status = 'pending';

COMMIT;
