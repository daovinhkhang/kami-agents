import { getKamiConfig } from "../config"

/**
 * Generates embeddings via DeepSeek API (OpenAI-compatible /v1/embeddings).
 *
 * Uses the same API key + base URL as the chat provider. Falls back to a
 * simple bag-of-words hash when the API is unreachable or not configured.
 */
export type EmbeddingClient = {
  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<number[]>
  /** Embedding dimension (depends on the model). */
  readonly dimension: number
}

export const createEmbeddingClient = (): EmbeddingClient => {
  const config = getKamiConfig()
  const model = "deepseek-chat" // DeepSeek embeddings use the chat model endpoint

  return {
    dimension: 1536,

    async embed(text: string): Promise<number[]> {
      if (!config.apiKey) {
        return hashEmbed(text, this.dimension)
      }

      try {
        const response = await fetch(`${config.baseUrl}/v1/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: text,
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (!response.ok) {
          throw new Error(`Embeddings API returned ${response.status}`)
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[] }>
        }

        if (data.data?.[0]?.embedding) {
          return data.data[0].embedding
        }

        return hashEmbed(text, this.dimension)
      } catch {
        // Fallback to hash-based embedding when API is unavailable.
        return hashEmbed(text, this.dimension)
      }
    },
  }
}

/**
 * Deterministic hash-based embedding fallback.
 *
 * Splits text into word bigrams, hashes each to a float in [-1, 1],
 * and sums into a fixed-dimension vector. Not semantically meaningful
 * but enables similarity comparison when the API is unavailable.
 */
function hashEmbed(text: string, dimension: number): number[] {
  const vector = new Array(dimension).fill(0)
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return vector
  }

  // Word bigrams for slightly better discrimination than single words.
  const tokens: string[] = []
  for (let i = 0; i < words.length; i++) {
    tokens.push(words[i])
    if (i < words.length - 1) {
      tokens.push(words[i] + "_" + words[i + 1])
    }
  }

  for (const token of tokens) {
    let hash = 0
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0
    }

    // Map hash into [-1, 1] across the dimension space.
    for (let d = 0; d < dimension; d++) {
      const mixed = ((hash * (d + 1) * 2654435761) | 0) >>> 0
      vector[d] += (mixed % 2000) / 1000 - 1
    }
  }

  // Normalize to unit length.
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude > 0) {
    for (let d = 0; d < dimension; d++) {
      vector[d] /= magnitude
    }
  }

  return vector
}
