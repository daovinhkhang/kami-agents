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
