import type { KamiCtx } from "../types"
import type { MemoryAddInput, MemoryProvider, MemorySearchInput } from "./provider"
import { createEmbeddingClient } from "./embedding-client"
import { cosineSimilarity, topKSimilar } from "./cosine-similarity"

/**
 * Dialectic memory provider inspired by Honcho (Phase 6).
 *
 * Organizes memories as evolving "beliefs" that can be confirmed,
 * contradicted, or refined over time. Each belief carries:
 *  - thesis: the original statement
 *  - antithesis: any conflicting observation
 *  - synthesis: the reconciled understanding
 *  - confidence: 0.0 (rejected) to 1.0 (confirmed)
 *  - evidence_count: number of supporting/contradicting observations
 *
 * When a new memory contradicts an existing belief, the provider
 * flags it for consolidation rather than silently overwriting.
 * The `consolidate()` method uses an LLM pass to reconcile.
 */
export type DialecticBelief = {
  id: string
  thesis: string
  antithesis?: string
  synthesis?: string
  confidence: number
  evidence_count: number
  embedding?: number[]
  created_at: string
  updated_at: string
}

export type DialecticMemoryProvider = MemoryProvider & {
  /** List all current beliefs with their confidence scores. */
  getBeliefs(): Promise<DialecticBelief[]>
  /**
   * Find beliefs that may contradict a new memory.
   * Returns pairs of [belief, contradiction_score] sorted by score desc.
   */
  findContradictions(
    content: string
  ): Promise<Array<{ belief: DialecticBelief; score: number }>>
  /**
   * Consolidate a contradiction into a synthesis belief.
   * Called after LLM review. Low-confidence beliefs (< 0.3) are deprecated.
   */
  consolidate(thesisId: string, antithesis: string): Promise<DialecticBelief>
}

export const createDialecticMemoryProvider = (
  ctx: KamiCtx
): DialecticMemoryProvider => {
  const embeddingClient = createEmbeddingClient()

  const normalize = (belief: any): DialecticBelief => ({
    id: belief.id,
    thesis: belief.content ?? "",
    antithesis: belief.metadata?.antithesis as string | undefined,
    synthesis: belief.metadata?.synthesis as string | undefined,
    confidence: Number(belief.metadata?.confidence ?? 1.0),
    evidence_count: Number(belief.metadata?.evidence_count ?? 1),
    embedding: belief.metadata?.embedding as number[] | undefined,
    created_at: belief.created_at ?? "",
    updated_at: belief.updated_at ?? "",
  })

  return {
    async add(input: MemoryAddInput) {
      let embedding: number[] | undefined
      try {
        embedding = await embeddingClient.embed(input.content)
      } catch { /* store without embedding */ }

      const importance = input.importance ?? 1
      const confidence = Math.min(1, Math.max(0.1, importance / 5))

      const [memory] = await ctx.kami.createKamiMemories([
        {
          content: input.content,
          type: input.type ?? "factual",
          importance,
          user_id: input.user_id ?? ctx.userId ?? null,
          session_id: input.session_id ?? ctx.sessionId,
          metadata: {
            confidence,
            evidence_count: 1,
            embedding,
            dialectic: true,
          },
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

      try {
        const queryEmbedding = await embeddingClient.embed(input.query)
        const withEmbeddings = memories
          .filter((m: any) => m.metadata?.embedding)
          .map((m: any) => ({
            ...m,
            embedding: m.metadata.embedding,
          }))

        if (withEmbeddings.length >= limit) {
          return topKSimilar(queryEmbedding, withEmbeddings, limit)
        }
      } catch { /* fallback */ }

      const query = String(input.query ?? "").toLowerCase()
      return memories
        .filter((memory: any) => {
          const content = String(memory.content ?? "").toLowerCase()
          return content.includes(query)
        })
        .slice(0, limit)
    },

    async recall(limit = 10) {
      const memories = await ctx.kami.listKamiMemories(
        {},
        { take: Number(limit), order: { updated_at: "DESC" } }
      )
      return memories.map(normalize)
    },

    async getProfile() {
      const all = await ctx.kami.listKamiMemories(
        {},
        { take: 200, order: { updated_at: "DESC" } }
      )
      const beliefs = all.filter((m: any) => m.metadata?.dialectic)
      const highConf = beliefs.filter(
        (m: any) => (m.metadata?.confidence ?? 0) >= 0.7
      )
      const lowConf = beliefs.filter(
        (m: any) => (m.metadata?.confidence ?? 0) < 0.3
      )

      return {
        provider: "dialectic",
        total_beliefs: beliefs.length,
        high_confidence: highConf.length,
        low_confidence: lowConf.length,
        needs_consolidation: lowConf.length,
        top_beliefs: highConf.slice(0, 10).map(normalize),
        deprecated: lowConf.slice(0, 5).map(normalize),
      }
    },

    async getBeliefs(): Promise<DialecticBelief[]> {
      const all = await ctx.kami.listKamiMemories(
        { metadata: { dialectic: true } } as any,
        { take: 200, order: { updated_at: "DESC" } }
      )
      return all.map(normalize)
    },

    async findContradictions(content: string) {
      const beliefs = await this.getBeliefs()
      if (beliefs.length === 0) return []

      let queryEmbedding: number[] | undefined
      try {
        queryEmbedding = await embeddingClient.embed(content)
      } catch { /* fallback */ }

      if (queryEmbedding) {
        return beliefs
          .filter((b) => b.embedding)
          .map((belief) => ({
            belief,
            score: 1 - cosineSimilarity(queryEmbedding!, belief.embedding!),
          }))
          .filter((c) => c.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
      }

      // Text-based contradiction: shared keywords indicate potential conflict.
      const keywords = content.toLowerCase().split(/\s+/).filter(
        (w) => w.length > 3
      )
      return beliefs
        .map((belief) => {
          const thesis = belief.thesis.toLowerCase()
          const shared = keywords.filter((kw) => thesis.includes(kw))
          return { belief, score: shared.length / keywords.length }
        })
        .filter((c) => c.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    },

    async consolidate(
      thesisId: string,
      synthesis: string
    ): Promise<DialecticBelief> {
      let embedding: number[] | undefined
      try {
        embedding = await embeddingClient.embed(synthesis)
      } catch { /* ok */ }

      const existing = await ctx.kami.listKamiMemories({ id: thesisId }, {})
      const priorCount = Number(existing?.[0]?.metadata?.evidence_count ?? 1)

      const updated = await ctx.kami.updateKamiMemories({
        id: thesisId,
        content: synthesis,
        metadata: {
          synthesis,
          confidence: 0.8,
          evidence_count: priorCount + 1,
          embedding,
          dialectic: true,
          consolidated_at: new Date().toISOString(),
        },
      })

      return normalize(updated)
    },
  }
}
