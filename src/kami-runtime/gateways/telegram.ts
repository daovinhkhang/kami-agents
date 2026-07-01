import type {
  GatewayAdapter,
  GatewayMessage,
  GatewaySendOptions,
} from "./types"

/**
 * Telegram Bot API gateway adapter.
 *
 * Setup:
 *   1. Create a bot with @BotFather → get token.
 *   2. Set webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>
 *   3. Optionally set KAMI_GATEWAY_TELEGRAM_SECRET in .env — Telegram will
 *      send this as X-Telegram-Bot-Api-Secret-Token on every webhook call.
 *
 * Webhook URL (after deploy):
 *   https://<your-domain>/admin/kami/gateways/telegram
 */
export class TelegramGateway implements GatewayAdapter {
  readonly id = "telegram"
  readonly label = "Telegram"

  readonly #token: string
  readonly #secret: string | null
  readonly #baseUrl: string

  constructor(token: string, secret?: string) {
    this.#token = token
    this.#secret = secret ?? null
    this.#baseUrl = `https://api.telegram.org/bot${token}`
  }

  verify(
    body: string,
    headers: Record<string, string>
  ): boolean {
    // If a secret is configured, Telegram sends it in this header.
    if (this.#secret) {
      const received =
        headers["x-telegram-bot-api-secret-token"] ?? ""
      return received === this.#secret
    }

    // Without a secret, accept all requests (less secure — use secret in prod).
    return true
  }

  parse(body: Record<string, unknown>): GatewayMessage | null {
    const message = (body.message ?? body.edited_message) as
      | Record<string, unknown>
      | undefined

    if (!message?.text) {
      // Ignore non-text events (join, leave, photos, etc.).
      return null
    }

    const chat = message.chat as Record<string, unknown>
    const from = message.from as Record<string, unknown>

    return {
      chatId: String(chat?.id ?? ""),
      senderId:
        (from?.username as string) ??
        (from?.first_name as string) ??
        "unknown",
      text: String(message.text),
      threadId: message.message_thread_id
        ? String(message.message_thread_id)
        : undefined,
      raw: body,
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: GatewaySendOptions
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, 4096), // Telegram max message length
      parse_mode: options?.parseMode === "markdown" ? "MarkdownV2" : undefined,
    }

    if (options?.replyToMessageId) {
      body.reply_to_message_id = options.replyToMessageId
    }

    const response = await fetch(`${this.#baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    return await response.json()
  }
}
