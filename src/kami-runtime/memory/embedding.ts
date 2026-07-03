import type { KamiCtx } from "../types"
import type { MemoryAddInput, MemoryProvider, MemorySearchInput } from "./provider"
import { createEmbeddingClient } from "./embedding-client"
import { topKSimilar } from "./cosine-similarity"

/**
 * Embedding-based memory provider (Phase 6).
 *
 * Adds semantic search on top of the Postgres store. Each memory gets an
 * embedding vector generated via DeepSeek embeddings API. Search uses
 * cosine similarity against the query embedding.
 *
 * Falls back gracefully: if no embeddings are stored (e.g. memories created
 * before this provider was enabled), search degrades to substring match.
 */
export const createEmbeddingMemoryProvider = (
  ctx: KamiCtx
): MemoryProvider => {
  const embeddingClient = createEmbeddingClient()

  return {
    async add(input: MemoryAddInput) {
      let embedding: number[] | undefined

      try {
        embedding = await embeddingClient.embed(input.content)
      } catch {
        // Store without embedding — search will use text fallback.
      }

      const [memory] = await ctx.kami.createKamiMemories([
        {
          content: input.content,
          type: input.type ?? "factual",
          importance: input.importance ?? 1,
          user_id: input.user_id ?? ctx.userId ?? null,
          session_id: input.session_id ?? ctx.sessionId,
          metadata: { embedding },
        },
      ])

      return memory
    },

    async search(input: MemorySearchInput) {
      const memories = await ctx.kami.listKamiMemories(
        {},
        { take: 500, order: { created_at: "DESC" } }
      )

      const limit = Number(input.limit ?? 10)

      // Try embedding-based search first.
      try {
        const queryEmbedding = await embeddingClient.embed(input.query)
        const withEmbeddings = memories.filter(
          (m: any) =>
            m.metadata?.embedding &&
            Array.isArray(m.metadata.embedding)
        )

        if (withEmbeddings.length >= limit) {
          return topKSimilar(
            queryEmbedding,
            withEmbeddings.map((m: any) => ({
              ...m,
              embedding: m.metadata.embedding,
            })),
            limit
          )
        }
      } catch {
        // Fallback to text search below.
      }

      // Text-based fallback.
      const query = String(input.query ?? "").toLowerCase()
      return memories
        .filter((memory: any) => {
          const content = String(memory.content ?? "").toLowerCase()
          const type = String(memory.type ?? "").toLowerCase()
          return content.includes(query) || type.includes(query)
        })
        .slice(0, limit)
    },

    async recall(limit = 10) {
      return await ctx.kami.listKamiMemories(
        {},
        {
          take: Number(limit),
          order: { created_at: "DESC" },
        }
      )
    },

    async getProfile() {
      const memories = await this.recall(50)
      const withEmbeddings = memories.filter(
        (m: any) => m.metadata?.embedding
      )

      return {
        provider: "embedding",
        model: "deepseek-chat",
        dimension: embeddingClient.dimension,
        total_memories: memories.length,
        memories_with_embeddings: withEmbeddings.length,
        recent: memories.slice(0, 10),
      }
    },
  }
}
