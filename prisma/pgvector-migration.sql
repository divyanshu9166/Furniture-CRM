-- pgvector-migration.sql
-- Run AFTER `npx prisma db push` creates the wa_knowledge_chunks table.
-- Command: npx prisma db execute --file prisma/pgvector-migration.sql
--
-- Updated for Xenova/multilingual-e5-small (384-dim).
-- If you previously ran this with Gemini embeddings (768-dim), run
-- prisma/pgvector-resize-384.sql first to resize the column.

-- 1. Enable the pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column to wa_knowledge_chunks (384-dim, idempotent)
ALTER TABLE wa_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. IVFFlat index for fast cosine-similarity search
CREATE INDEX IF NOT EXISTS wa_knowledge_chunks_embedding_idx
  ON wa_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. Supplementary index on user_id for filtered searches
CREATE INDEX IF NOT EXISTS wa_knowledge_chunks_user_id_idx
  ON wa_knowledge_chunks (user_id);
