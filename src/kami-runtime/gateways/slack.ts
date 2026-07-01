import type {
  GatewayAdapter,
  GatewayMessage,
  GatewaySendOptions,
} from "./types"

/**
 * Slack Bot (Socket Mode not required — uses Events API webhook).
 *
 * Setup:
 *   1. Create an app at https://api.slack.com/apps
 *   2. Enable Event Subscriptions → set Request URL to your webhook.
 *   3. Subscribe to `message.channels`, `app_mention` events.
 *   4. Add OAuth scopes: `chat:write`, `channels:history`, `app_mentions:read`.
 *   5. Install to workspace → get Bot Token + Signing Secret.
 *
 * Slack sends a `url_verification` challenge on URL registration — the
 * handler responds with the challenge token.
 *
 * Webhook URL:
 *   https://<your-domain>/admin/kami/gateways/slack
 */
export class SlackGateway implements GatewayAdapter {
  readonly id = "slack"
  readonly label = "Slack"

  readonly #token: string
  readonly #signingSecret: string
  readonly #baseUrl = "https://slack.com/api"

  constructor(token: string, signingSecret: string) {
    this.#token = token
    this.#signingSecret = signingSecret
  }

  async verify(
    body: string,
    headers: Record<string, string>
  ): Promise<boolean> {
    const signature = headers["x-slack-signature"] ?? ""
    const timestamp = headers["x-slack-request-timestamp"] ?? ""

    if (!signature || !timestamp) {
      return false
    }

    // Reject old timestamps (>5 min) to prevent replay attacks.
    const now = Math.floor(Date.now() / 1000)

    if (Math.abs(now - Number(timestamp)) > 300) {
      return false
    }

    // HMAC-SHA256 signature verification.
    const sigBaseString = `v0:${timestamp}:${body}`

    const crypto = await import("node:crypto")
    const hmac = crypto.createHmac("sha256", this.#signingSecret)

    hmac.update(sigBaseString)
    const computed = `v0=${hmac.digest("hex")}`

    // Constant-time comparison.
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(signature)
      )
    } catch {
      return false
    }
  }

  parse(body: Record<string, unknown>): GatewayMessage | null {
    // Slack URL verification challenge.
    if (body.type === "url_verification" && body.challenge) {
      return {
        chatId: "__challenge__",
        senderId: "slack",
        text: `__challenge__${body.challenge}`,
        raw: body,
      }
    }

    // Event callback.
    const event = body.event as Record<string, unknown> | undefined

    if (!event) {
      return null
    }

    const eventType = event.type as string

    // Ignore bot's own messages, message_changed, etc.
    if (event.bot_id || event.subtype === "bot_message") {
      return null
    }

    const text = (event.text as string) ?? ""
    const userId = (event.user as string) ?? "unknown"

    return {
      chatId: (event.channel as string) ?? userId,
      senderId: userId,
      text,
      threadId: event.thread_ts as string | undefined,
      raw: body,
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: GatewaySendOptions
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      channel: chatId,
      text: text.slice(0, 3000), // Slack max
      mrkdwn: options?.parseMode !== "plain",
    }

    if (options?.replyToMessageId) {
      body.thread_ts = options.replyToMessageId
    }

    const response = await fetch(`${this.#baseUrl}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#token}`,
      },
      body: JSON.stringify(body),
    })

    return await response.json()
  }
}
