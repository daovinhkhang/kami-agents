import type { KamiCtx } from "../types"
import type { MemoryAddInput, MemoryProvider, MemorySearchInput } from "./provider"

const includes = (value: unknown, query: string) => {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase())
}

export const createPostgresMemoryProvider = (ctx: KamiCtx): MemoryProvider => ({
  async add(input: MemoryAddInput) {
    const [memory] = await (ctx.kami as any).createKamiMemories([
      {
        content: input.content,
        type: input.type ?? "factual",
        importance: input.importance ?? 1,
        user_id: input.user_id ?? ctx.userId ?? null,
        session_id: input.session_id ?? ctx.sessionId,
      },
    ])

    return memory
  },

  async search(input: MemorySearchInput) {
    const memories = await (ctx.kami as any).listKamiMemories(
      {},
      { take: 200, order: { created_at: "DESC" } }
    )
    const limit = Number(input.limit ?? 10)

    return memories
      .filter((memory: any) => includes(memory.content, input.query))
      .slice(0, limit)
  },

  async recall(limit = 10) {
    return await (ctx.kami as any).listKamiMemories(
      {},
      {
        take: Number(limit),
        order: { created_at: "DESC" },
      }
    )
  },

  async getProfile() {
    const memories = await this.recall(20)

    return {
      provider: "postgres",
      memory_count_sample: memories.length,
      recent: memories,
    }
  },
})

