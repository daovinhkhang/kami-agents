/**
 * GET /admin/kami/chat/stream-status/:sessionId
 *
 * Returns the status of any active generation job for a session.
 * Used by the frontend to auto-reconnect when navigating back to a session
 * that still has a running generation.
 *
 * Response:
 *   { active: true, streamId, status, eventCount, startedAt }  — job is running
 *   { active: false }                                           — no active job
 */

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getStreamManager } from "@kami/loop/stream-manager"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sessionId = req.params.sessionId as string
  const streamManager = getStreamManager()

  const job = streamManager.getActiveJobBySessionId(sessionId)

  if (!job) {
    res.json({ active: false })
    return
  }

  res.json({
    active: true,
    streamId: job.id,
    status: job.status,
    eventCount: job.events.length,
    startedAt: job.createdAt.toISOString(),
  })
}
