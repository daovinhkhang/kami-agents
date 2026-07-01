import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const job = await (resolveKami(req) as any).retrieveKamiJob(req.params.id)

  res.json({ job })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const job = await (resolveKami(req) as any).updateKamiJobs({
    id: req.params.id,
    ...body,
    next_run_at: body.next_run_at ? new Date(body.next_run_at) : body.next_run_at,
  })

  res.json({ job })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await (resolveKami(req) as any).deleteKamiJobs(req.params.id)

  res.json({ id: req.params.id, object: "kami_job", deleted: true })
}
