import type { KamiCtx } from "../types"

export type MemoryAddInput = {
  content: string
  type?: "factual" | "preference" | "goal" | "instruction" | "event"
  importance?: number
  user_id?: string
  session_id?: string
}

export type MemorySearchInput = {
  query: string
  limit?: number
}

export interface MemoryProvider {
  add(input: MemoryAddInput): Promise<unknown>
  search(input: MemorySearchInput): Promise<unknown[]>
  recall(limit?: number): Promise<unknown[]>
  getProfile(): Promise<Record<string, unknown>>
}

export type MemoryProviderFactory = (ctx: KamiCtx) => MemoryProvider

