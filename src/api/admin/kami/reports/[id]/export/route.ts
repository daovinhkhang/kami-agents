import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { artifactToCsv, artifactToMarkdown } from "@kami/report/export"
import { resolveKami } from "../../../utils"

const filename = (title: string, ext: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kami-report"}.${ext}`

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const artifact = await (resolveKami(req) as any).retrieveKamiArtifact(req.params.id)
  const format = String(req.query.format ?? "csv")

  if (format === "md" || format === "markdown") {
    const body = artifactToMarkdown(artifact.payload)
    res.setHeader("Content-Type", "text/markdown; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${filename(artifact.title ?? "kami-report", "md")}"`)
    res.send(body)
    return
  }

  const body = artifactToCsv(artifact.payload)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${filename(artifact.title ?? "kami-report", "csv")}"`)
  res.send(body)
}
