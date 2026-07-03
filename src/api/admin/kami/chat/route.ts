import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { runTurn } from "@kami/index"
import { writeSse } from "@kami/loop/events"
import { resolveKami } from "../utils"

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

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  })

  if (!body.message) {
    writeSse(res.write.bind(res), {
      type: "error",
      message: "message is required",
    })
    res.end()
    return
  }

  const kami = resolveKami(req)
  const actorId = req.auth_context?.actor_id

  // If the client disconnects mid-turn (closes tab, navigates away), we must
  // NOT abort generation — the runTurn generator still has to run to completion
  // so every message (final answer included) gets persisted. Otherwise a
  // disconnect after tool results but before the final answer leaves the
  // session with only tool cards and no assistant text on reload.
  let clientGone = false
  req.on("close", () => {
    clientGone = true
  })

  // Writing to a dead socket throws; swallow it so the generator keeps draining.
  const safeWrite = (chunk: string) => {
    if (clientGone) return
    try {
      res.write(chunk)
    } catch {
      clientGone = true
    }
  }

  for await (const event of runTurn(
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
  )) {
    writeSse(safeWrite, event)
  }

  if (!clientGone) {
    res.end()
  }
}
