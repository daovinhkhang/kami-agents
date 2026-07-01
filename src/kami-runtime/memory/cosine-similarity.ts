/**
 * Cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    return 0
  }

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB)
  if (denominator === 0) {
    return 0
  }

  return dot / denominator
}

/**
 * Top-K search from a list of candidates using cosine similarity.
 * Each candidate must have an `embedding` array field.
 */
export const topKSimilar = <T extends { embedding?: number[] | null }>(
  queryEmbedding: number[],
  candidates: T[],
  k: number
): (T & { score: number })[] => {
  return candidates
    .filter((c): c is T & { embedding: number[] } => {
      const emb = (c as any).embedding
      return Array.isArray(emb) && emb.length === queryEmbedding.length
    })
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, c.embedding!),
    }))
    .filter((c) => c.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
