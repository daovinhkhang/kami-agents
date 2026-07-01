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
    writeSse(res.write.bind(res), event)
  }

  res.end()
}
