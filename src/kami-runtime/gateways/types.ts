/**
 * Gateway adapters let KAMI receive messages from external platforms
 * (Telegram, Discord, Slack) and respond back via each platform's API.
 *
 * Each adapter handles:
 *  - Webhook verification (signature/secret check)
 *  - Message parsing (extract text, sender, channel)
 *  - Response sending (text + optional rich formatting)
 *
 * Incoming messages flow through the standard KAMI loop:
 *   webhook → parse → runTurn(source:"gateway") → sendMessage back
 */
export type GatewayMessage = {
  /** Platform-native chat/channel id for the response target. */
  chatId: string
  /** Human-readable sender identifier (username or display name). */
  senderId: string
  /** The message text the user typed. */
  text: string
  /** Optional thread/context id for platforms that support threads. */
  threadId?: string
  /** Raw body for platform-specific processing beyond the common fields. */
  raw: Record<string, unknown>
}

export type GatewaySendOptions = {
  /** Markdown or plain text — platform-dependent. */
  parseMode?: "markdown" | "html" | "plain"
  /** Reply to a specific message in the channel. */
  replyToMessageId?: string
}

export type GatewayConnection = {
  /** Unique id (platform name, e.g. "telegram"). */
  id: string
  /** Human-readable label for the admin UI. */
  label: string
  /** Whether this gateway is enabled. */
  enabled: boolean
  /** Configuration registered at startup. */
  config: Record<string, string>
}

export interface GatewayAdapter {
  readonly id: string
  readonly label: string

  /**
   * Verify an incoming webhook request came from the platform.
   * Returns true if the signature/secret check passes.
   */
  verify(
    body: string,
    headers: Record<string, string>
  ): boolean | Promise<boolean>

  /**
   * Extract the user message from the webhook payload.
   * Returns null if the event should be ignored (e.g. non-message event).
   */
  parse(body: Record<string, unknown>): GatewayMessage | null

  /**
   * Send a text response back to the platform.
   */
  sendMessage(
    chatId: string,
    text: string,
    options?: GatewaySendOptions
  ): Promise<unknown>
}
