import type { KamiEvent } from "../types"

export const encodeSse = (event: KamiEvent) => {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export const writeSse = (write: (chunk: string) => void, event: KamiEvent) => {
  write(encodeSse(event))
}
