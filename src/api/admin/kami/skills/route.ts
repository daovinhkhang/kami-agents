import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const skills = await (resolveKami(req) as any).listKamiSkills(
    {},
    listConfig(req)
  )

  res.json({ skills })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const [skill] = await (resolveKami(req) as any).createKamiSkills([
    {
      name: body.name,
      description: body.description ?? null,
      category: body.category ?? null,
      version: body.version ?? "0.1.0",
      content: body.content,
      frontmatter: body.frontmatter ?? null,
      origin: body.origin ?? "human",
      platforms: body.platforms ?? null,
      disabled: body.disabled ?? false,
      metadata: body.metadata ?? null,
    },
  ])

  res.status(201).json({ skill })
}
