import type { KamiChatMessage } from "../types"

export const estimateTokens = (messages: KamiChatMessage[]) => {
  const chars = messages.reduce(
    (sum, message) => sum + (message.content?.length ?? 0),
    0
  )

  return Math.ceil(chars / 4)
}
