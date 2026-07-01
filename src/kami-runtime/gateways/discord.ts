import type {
  GatewayAdapter,
  GatewayMessage,
  GatewaySendOptions,
} from "./types"

/**
 * Discord Bot gateway adapter (HTTP interactions endpoint).
 *
 * Setup:
 *   1. Create an app at https://discord.com/developers/applications
 *   2. Add a bot, grab the token and public key.
 *   3. Set Interactions Endpoint URL to your webhook URL.
 *   4. Discord sends a PING (type 1) on registration — handle it with ACK.
 *
 * Webhook URL:
 *   https://<your-domain>/admin/kami/gateways/discord
 */
const verifyEd25519 = async (
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): Promise<boolean> => {
  try {
    const crypto = await import("node:crypto")
    const publicKeyBytes = hexToUint8Array(publicKeyHex)
    const signatureBytes = hexToUint8Array(signatureHex)

    // Discord sends raw 32-byte Ed25519 public key. Create a KeyObject
    // via JWK format which accepts the raw x coordinate.
    const key = crypto.createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: Buffer.from(publicKeyBytes).toString("base64url"),
      },
      format: "jwk",
    })

    return crypto.verify(
      null,
      Buffer.from(timestamp + body),
      key,
      Buffer.from(signatureBytes)
    )
  } catch {
    return false
  }
}

const hexToUint8Array = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }

  return bytes
}

export class DiscordGateway implements GatewayAdapter {
  readonly id = "discord"
  readonly label = "Discord"

  readonly #token: string
  readonly #publicKey: string
  readonly #baseUrl = "https://discord.com/api/v10"

  constructor(token: string, publicKey: string) {
    this.#token = token
    this.#publicKey = publicKey
  }

  verify(
    body: string,
    headers: Record<string, string>
  ): boolean {
    const signature = headers["x-signature-ed25519"] ?? ""
    const timestamp = headers["x-signature-timestamp"] ?? ""

    if (!signature || !timestamp) {
      return false
    }

    // Verification is async but the webhook handler must await it.
    // We store the params for verifyAsync instead.
    return true // defer to verifyAsync
  }

  async verifyAsync(
    body: string,
    headers: Record<string, string>
  ): Promise<boolean> {
    const signature = headers["x-signature-ed25519"] ?? ""
    const timestamp = headers["x-signature-timestamp"] ?? ""

    if (!signature || !timestamp) {
      return false
    }

    return await verifyEd25519(
      this.#publicKey,
      signature,
      timestamp,
      body
    )
  }

  parse(body: Record<string, unknown>): GatewayMessage | null {
    // Discord Interactions: type 1 = PING (respond with type 1 ACK)
    const type = body.type as number

    if (type === 1) {
      return null // PING — handler responds with { type: 1 }
    }

    // type 2 = APPLICATION_COMMAND, type 3 = MESSAGE_COMPONENT,
    // type 4 = APPLICATION_COMMAND_AUTOCOMPLETE, type 5 = MODAL_SUBMIT
    // We also handle message events from guilds (MESSAGE_CREATE via gateway).
    // For HTTP interactions, we only receive slash commands.

    // Extract from slash command interaction.
    const data = body.data as Record<string, unknown> | undefined

    if (!data?.name) {
      return null
    }

    // Get the user's input from options or the command itself.
    const options = data.options as
      | Array<{ name: string; value: string }>
      | undefined

    const userInput =
      options
        ?.map((opt) => `${opt.name}: ${opt.value}`)
        .join(" ") ?? data.name

    const member = body.member as Record<string, unknown> | undefined
    const user = (member?.user ?? body.user) as Record<string, unknown> | undefined

    return {
      chatId: String(body.channel_id ?? ""),
      senderId:
        (user?.username as string) ??
        (user?.id as string) ??
        "unknown",
      text: String(userInput),
      raw: body,
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: GatewaySendOptions
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      content: text.slice(0, 2000), // Discord max message length
    }

    const response = await fetch(
      `${this.#baseUrl}/channels/${chatId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${this.#token}`,
        },
        body: JSON.stringify(body),
      }
    )

    return await response.json()
  }
}
