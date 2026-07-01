import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const skill = await (resolveKami(req) as any).retrieveKamiSkill(req.params.id)

  res.json({ skill })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const skill = await (resolveKami(req) as any).updateKamiSkills({
    id: req.params.id,
    ...(req.body as any),
  })

  res.json({ skill })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await (resolveKami(req) as any).deleteKamiSkills(req.params.id)

  res.json({ id: req.params.id, object: "kami_skill", deleted: true })
}
