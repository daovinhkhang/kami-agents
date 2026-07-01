/**
 * GET /admin/kami/chat/stream/:streamId
 *
 * SSE endpoint for streaming generation events. Supports resume:
 *   ?resume=true — replays all buffered events before live streaming
 *
 * Compatible with EventSource and custom SSE clients.
 */

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getStreamManager } from "@kami/loop/stream-manager"
import { ActiveLoops } from "@kami/loop/active-loops"
import { encodeSse } from "@kami/loop/events"
import type { KamiEvent } from "@kami/types"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const streamId = req.params.streamId as string
  const shouldResume = req.query.resume === "true"
  const streamManager = getStreamManager()

  const job = streamManager.getJob(streamId)
  if (!job) {
    res.status(404).json({ error: "Stream not found. It may have expired." })
    return
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  })

  const write = (chunk: string) => {
    try {
      res.write(chunk)
    } catch {
      // Client disconnected — unsubscribe handled in close handler
    }
  }

  // If resuming, replay buffered events first
  if (shouldResume) {
    const events = streamManager.getEventsForResume(streamId)
    if (events.length > 0) {
      // Send a sync marker so the client knows replay is starting
      write(encodeSse({
        type: "text_delta",
        delta: "",
      } as KamiEvent).replace('event: text_delta', 'event: sync'))
      write(`data: ${JSON.stringify({ replayed_count: events.length })}\n\n`)

      for (const event of events) {
        write(encodeSse(event))
      }

      // End-of-replay marker
      write(encodeSse({
        type: "text_delta",
        delta: "",
      } as KamiEvent).replace('event: text_delta', 'event: sync_done'))
      write(`data: ${JSON.stringify({})}\n\n`)
    }
  }

  // If job is already completed/errored/aborted, send a done and close
  if (job.status !== "running" && job.status !== "paused") {
    write(encodeSse({
      type: "done",
      reason: job.status,
    }))
    res.end()
    return
  }

  // Subscribe to live events
  const unsubscribe = streamManager.subscribe(streamId, (event: KamiEvent) => {
    write(encodeSse(event))

    // Close connection on terminal events
    if (event.type === "done" || event.type === "error") {
      unsubscribe()
      res.end()
    }
  })

  // Heartbeat to keep connection alive (every 15s)
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n")
    } catch {
      clearInterval(heartbeat)
      unsubscribe()
    }
  }, 15_000)

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat)
    unsubscribe()
  })

  // Cleanup on server finish
  res.on("finish", () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

/**
 * DELETE /admin/kami/chat/stream/:streamId
 * Abort a running generation.
 */
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const streamId = req.params.streamId as string
  const streamManager = getStreamManager()

  const job = streamManager.getJob(streamId)
  if (!job) {
    res.status(404).json({ error: "Stream not found or already completed." })
    return
  }

  const aborted = streamManager.abort(streamId)
  if (!aborted) {
    res.status(404).json({ error: "Stream not found or already completed." })
    return
  }

  // Also halt the ActiveLoop so the runTurn generator stops
  // This ensures the generation actually stops, not just the stream
  if (job.sessionId && job.sessionId !== "pending") {
    ActiveLoops.halt(job.sessionId)
  }

  res.json({ streamId, status: "aborted" })
}
