import type { KamiChatMessage } from "../types"

export const compressMessages = (messages: KamiChatMessage[]) => {
  if (messages.length <= 12) {
    return messages
  }

  const head = messages.slice(0, 2)
  const tail = messages.slice(-10)
  const omitted = messages.length - head.length - tail.length

  return [
    ...head,
    {
      role: "system" as const,
      content: `Context compressed: ${omitted} older messages omitted. Use persisted session history tools if exact detail is needed.`,
    },
    ...tail,
  ]
}
