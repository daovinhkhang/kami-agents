/**
 * Initialize all configured gateway adapters.
 *
 * Called once at app startup (from medusa-config loader or the KAMI module
 * loader) so that webhook handlers can route incoming messages to the right
 * adapter via the gateway manager.
 */
import { registerGateway } from "./manager"
import { TelegramGateway } from "./telegram"
import { DiscordGateway } from "./discord"
import { SlackGateway } from "./slack"

export const initGateways = () => {
  const telegramToken = process.env.KAMI_GATEWAY_TELEGRAM_TOKEN

  if (telegramToken) {
    registerGateway(
      new TelegramGateway(
        telegramToken,
        process.env.KAMI_GATEWAY_TELEGRAM_SECRET
      )
    )
  }

  const discordToken = process.env.KAMI_GATEWAY_DISCORD_TOKEN
  const discordPublicKey = process.env.KAMI_GATEWAY_DISCORD_PUBLIC_KEY

  if (discordToken && discordPublicKey) {
    registerGateway(
      new DiscordGateway(discordToken, discordPublicKey)
    )
  }

  const slackToken = process.env.KAMI_GATEWAY_SLACK_TOKEN
  const slackSigningSecret =
    process.env.KAMI_GATEWAY_SLACK_SIGNING_SECRET

  if (slackToken && slackSigningSecret) {
    registerGateway(
      new SlackGateway(slackToken, slackSigningSecret)
    )
  }
}

export { registerGateway, getGateway, listGateways, hasGateway } from "./manager"
export { TelegramGateway } from "./telegram"
export { DiscordGateway } from "./discord"
export { SlackGateway } from "./slack"
export type {
  GatewayAdapter,
  GatewayMessage,
  GatewaySendOptions,
  GatewayConnection,
} from "./types"
