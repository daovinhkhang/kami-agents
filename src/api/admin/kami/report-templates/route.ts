import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BUILT_IN_REPORT_TEMPLATES } from "@kami/report/templates"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const dbTemplates = await (resolveKami(req) as any).listKamiReportTemplates(
    { disabled: false },
    listConfig(req)
  )

  const templates = [
    ...BUILT_IN_REPORT_TEMPLATES,
    ...dbTemplates.map((template: any) => ({
      id: template.id,
      name: template.name,
      title: template.title,
      description: template.description,
      prompt: template.prompt,
      required_tools: template.required_tools ?? [],
      category: template.category,
      schedule_presets: template.metadata?.schedule_presets ?? [],
    })),
  ]

  res.json({ templates })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any

  if (!body.name || !body.title || !body.prompt) {
    res.status(400).json({
      type: "invalid_request",
      message: "name, title, and prompt are required",
    })
    return
  }

  const [template] = await (resolveKami(req) as any).createKamiReportTemplates([
    {
      name: body.name,
      title: body.title,
      description: body.description ?? null,
      prompt: body.prompt,
      required_tools: body.required_tools ?? [],
      artifact_schema: body.artifact_schema ?? null,
      category: body.category ?? "general",
      disabled: body.disabled ?? false,
      metadata: body.metadata ?? null,
    },
  ])

  res.status(201).json({ template })
}
