import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseSchedule } from "@kami/cron/schedule-parser"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const jobs = await (resolveKami(req) as any).listKamiJobs({}, listConfig(req))

  res.json({ jobs })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const parsed = parseSchedule(String(body.schedule ?? body.schedule_description ?? ""))
  const [job] = await (resolveKami(req) as any).createKamiJobs([
    {
      name: body.name,
      prompt: body.prompt,
      schedule: parsed.cron,
      deliver: body.deliver ?? null,
      session_id: body.session_id ?? null,
      enabled: body.enabled ?? true,
      next_run_at: body.next_run_at ? new Date(body.next_run_at) : null,
      metadata: {
        schedule_label: parsed.label,
        schedule_recognized: parsed.recognized,
        template_id: body.template_id ?? null,
        run_history: [],
        ...(body.metadata ?? {}),
      },
    },
  ])

  res.status(201).json({ job })
}
