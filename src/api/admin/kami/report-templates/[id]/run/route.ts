import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { findReportTemplate } from "@kami/report/templates"
import { resolveKami } from "../../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req) as any
  const body = req.body as any
  const builtIn = findReportTemplate(req.params.id)
  const dbTemplate = builtIn
    ? null
    : (await kami.listKamiReportTemplates({ id: req.params.id }, { take: 1 }))[0] ??
      (await kami.listKamiReportTemplates({ name: req.params.id }, { take: 1 }))[0]
  const template = builtIn ?? dbTemplate

  if (!template) {
    res.status(404).json({
      type: "not_found",
      message: "Report template not found",
    })
    return
  }

  const [session] = await kami.createKamiSessions([
    {
      title: template.title,
      source: "admin",
      user_id: req.auth_context?.actor_id ?? null,
      status: "active",
      message_count: 0,
      metadata: {
        category: "report",
        tags: ["report", template.category ?? "general"],
        template_id: template.id,
      },
    },
  ])

  res.status(201).json({
    session,
    message: body.message ?? template.prompt,
    template,
  })
}
