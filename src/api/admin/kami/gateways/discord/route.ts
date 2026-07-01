import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getGateway, initGateways } from "@kami/gateways"
import type { DiscordGateway } from "@kami/gateways"
import { runTurn } from "@kami/loop/run-turn"
import { getKamiConfig } from "@kami/config"

export const AUTHENTICATE = false

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  initGateways()
  const gateway = getGateway("discord") as DiscordGateway | undefined

  if (!gateway) {
    res.status(503).json({ error: "Discord gateway not configured" })
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

  // Discord PING (type 1) — respond immediately with ACK.
  if (body.type === 1) {
    res.status(200).json({ type: 1 })
    return
  }

  // Verify Ed25519 signature (async crypto).
  const verified = await gateway.verifyAsync(rawBody, headers)

  if (!verified) {
    res.status(401).json({ error: "Invalid webhook signature" })
    return
  }

  const message = gateway.parse(body)

  if (!message) {
    res.status(200).json({ type: 4, data: { content: "No actionable message." } })
    return
  }

  // For Discord interactions, acknowledge immediately with a deferred
  // response, then edit with the KAMI result.
  res.status(200).json({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: { flags: 0 },
  })

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
        fullText += `\n\n🔧 ${event.call.name}...`
      }
    }
  } catch (error) {
    fullText =
      error instanceof Error ? error.message : "KAMI encountered an error"
  }

  // Edit the deferred response or send a follow-up.
  const interactionToken = body.token as string | undefined
  const applicationId = body.application_id as string | undefined

  if (interactionToken && applicationId) {
    await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fullText.slice(0, 2000),
        }),
      }
    )
  } else if (message.chatId) {
    await gateway.sendMessage(message.chatId, fullText)
  }
}
