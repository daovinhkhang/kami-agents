/**
 * POST /admin/kami/chat/start
 *
 * Creates a generation job, returns { streamId, sessionId }, then runs
 * the KAMI turn in the background with events pushed to the StreamManager.
 * The client connects to GET /admin/kami/chat/stream/:streamId for SSE.
 */

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { runTurn } from "@kami/index"
import { getStreamManager } from "@kami/loop/stream-manager"
import { resolveKami } from "../../utils"

type KamiChatBody = {
  session_id?: string
  message: string
  toolset?: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<KamiChatBody>,
  res: MedusaResponse
) => {
  const body = (req.body ?? req.validatedBody ?? {}) as KamiChatBody

  if (!body.message) {
    res.status(400).json({ error: "message is required" })
    return
  }

  const kami = resolveKami(req)
  const actorId = req.auth_context?.actor_id
  const streamManager = getStreamManager()

  // ── Idempotent: if this session already has a running job, return it ──
  // This prevents orphaned jobs when the user navigates away and sends
  // another message from the same session. The existing generation continues
  // running independently; the frontend reconnects to the same stream.
  if (body.session_id) {
    const existingJob = streamManager.getActiveJobBySessionId(body.session_id)
    if (existingJob) {
      res.status(200).json({
        streamId: existingJob.id,
        sessionId: existingJob.sessionId,
        streamUrl: `/admin/kami/chat/stream/${existingJob.id}`,
        resumed: true,
        eventCount: existingJob.events.length,
      })
      return
    }
  }

  // Create a placeholder session ID first (will be updated when runTurn creates the real session)
  const job = streamManager.createJob(body.session_id || "pending")

  // Return immediately with stream info
  res.status(201).json({
    streamId: job.id,
    sessionId: job.sessionId,
    streamUrl: `/admin/kami/chat/stream/${job.id}`,
  })

  // Run the turn in the background, pushing events to the StreamManager
  // The generation runs INDEPENDENTLY of the SSE connection — it continues
  // even if the client disconnects. Only an explicit DELETE (stop button)
  // or server-side abort will stop it.
  const generator = runTurn(
    {
      sessionId: body.session_id,
      message: body.message,
      source: "admin",
      userId: actorId,
      toolset: body.toolset ?? "admin",
    },
    {
      scope: req.scope,
      kami,
    }
  )

  // Consume the async generator in the background, push each event
  const consume = async () => {
    try {
      for await (const event of generator) {
        // Update session ID from the session event
        if (event.type === "session" && event.session_id) {
          job.sessionId = event.session_id
        }
        streamManager.pushEvent(job.id, event)
      }
      streamManager.updateStatus(job.id, "completed")
    } catch (error: any) {
      streamManager.pushEvent(job.id, {
        type: "error",
        message: error?.message ?? "Unknown error during generation",
      })
      streamManager.updateStatus(job.id, "errored")
    }
  }
  consume()
}
