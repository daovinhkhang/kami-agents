import type { MedusaRequest } from "@medusajs/framework/http"
import type KamiModuleService from "../../../modules/kami/services/kami-module-service"

export const resolveKami = (req: MedusaRequest) => {
  return req.scope.resolve("kami") as KamiModuleService
}

export const listConfig = (req: MedusaRequest) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100)
  const offset = Number(req.query.offset ?? 0)

  return {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
  }
}

const firstHeader = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export const resolveRealtimeWsUrl = (
  req: MedusaRequest,
  port: number,
  path = "/kami/asr/realtime"
) => {
  const configuredHost = process.env.KAMI_PUBLIC_HOST?.trim()
  const forwardedHost = firstHeader(req.headers["x-forwarded-host"])
  const requestHost = firstHeader(req.headers.host)
  const host = configuredHost || forwardedHost || requestHost || "localhost"
  const hostname = host.split(",")[0].trim().replace(/:\d+$/, "")
  const scheme = process.env.KAMI_REALTIME_WS_SCHEME?.trim() || "ws"

  return `${scheme}://${hostname}:${port}${path}`
}
