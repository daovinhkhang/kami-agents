import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getGateway, initGateways } from "@kami/gateways"
import { runTurn } from "@kami/loop/run-turn"
import { getKamiConfig } from "@kami/config"

export const AUTHENTICATE = false

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  initGateways()
  const gateway = getGateway("slack")

  if (!gateway) {
    res.status(503).json({ error: "Slack gateway not configured" })
    return
  }

  const body = req.body as Record<string, unknown>
  const rawBody = JSON.stringify(body)
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [
      k.toLowerCase(),
      String(v ?? ""),
    ])
  )

  if (!(await gateway.verify(rawBody, headers))) {
    res.status(401).json({ error: "Invalid webhook signature" })
    return
  }

  // Slack URL verification challenge.
  if (body.type === "url_verification" && body.challenge) {
    res.status(200).json({ challenge: body.challenge })
    return
  }

  const message = gateway.parse(body)

  if (!message) {
    res.status(200).json({ ok: true })
    return
  }

  // Respond within 3s (Slack requirement) then process asynchronously.
  res.status(200).json({ ok: true })

  const config = getKamiConfig()
  const kami = req.scope.resolve("kami") as any
  let fullText = ""

  try {
    for await (const event of runTurn(
      {
        message: message.text,
        source: "gateway",
        toolset: "admin",
        userId: message.senderId,
        model: config.model,
      },
      { scope: req.scope, kami }
    )) {
      if (event.type === "text_delta") {
        fullText += event.delta ?? ""
      }

      if (event.type === "tool_start") {
        fullText += `\n🔧 ${event.call.name}...`
      }
    }
  } catch (error) {
    fullText =
      error instanceof Error ? error.message : "KAMI encountered an error"
  }

  if (fullText) {
    await gateway.sendMessage(
      message.chatId,
      fullText,
      message.threadId
        ? { replyToMessageId: message.threadId }
        : undefined
    )
  }
}
