/**
 * lib/ai-agent/retriever.ts
 *
 * pgvector cosine-similarity search over wa_knowledge_chunks.
 * The `embedding` column is NOT in the Prisma schema (pgvector isn't supported
 * natively), so we use a $queryRaw with the <=> operator.
 */

import { prisma } from '@/lib/db'

export interface RetrievedChunk {
  id: string
  content: string
  similarity: number
}

/**
 * Find the top-K most similar knowledge chunks for a given user.
 *
 * @param userId        - The CRM user whose knowledge base to search.
 * @param queryEmbedding - The embedding vector of the incoming customer message.
 * @param topK          - Maximum number of chunks to return (default 3).
 * @param minSimilarity - Cosine similarity threshold (default 0.4).
 */
export async function retrieveChunks(
  userId: string,
  queryEmbedding: number[],
  topK = 3,
  minSimilarity = 0.4,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`

  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      id,
      content,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM wa_knowledge_chunks
    WHERE
      user_id = ${userId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `

  return rows
}
