type ActiveLoop = {
  aborted: boolean
  abort: () => void
}

const loops = new Map<string, ActiveLoop>()

export const ActiveLoops = {
  register(sessionId: string) {
    const loop: ActiveLoop = {
      aborted: false,
      abort() {
        loop.aborted = true
      },
    }

    loops.set(sessionId, loop)

    return loop
  },

  unregister(sessionId: string) {
    loops.delete(sessionId)
  },

  halt(sessionId?: string) {
    if (sessionId) {
      loops.get(sessionId)?.abort()
      return loops.has(sessionId)
    }

    for (const loop of loops.values()) {
      loop.abort()
    }

    return loops.size > 0
  },

  list() {
    return [...loops.keys()]
  },
}
