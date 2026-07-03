import { Badge, Button, Text, Textarea } from "@medusajs/ui"
import { CheckCircleSolid, XCircleSolid } from "@medusajs/icons"
import { useEffect, useState } from "react"
import type {
  ArtifactPayload,
  ArtifactSection,
  CommerceDraftPayload,
  Row,
  UiCommand,
} from "./types"
import { compact, recordHref, riskColor, safeJson, toolLabel } from "./helpers"
import { KamiMarkdown } from "./markdown"

/* ------------------------------------------------------------------ */
/*  Inline chat cards — the old right-side panels, rendered in-stream. */
/*  opencode-style: each is a self-contained card the assistant turn   */
/*  emits inline, instead of opening a separate panel.                 */
/* ------------------------------------------------------------------ */

const CardShell = ({
  accent,
  header,
  children,
}: {
  accent?: string
  header: React.ReactNode
  children: React.ReactNode
}) => (
  <div className={`overflow-hidden rounded-lg border bg-ui-bg-base kami-fade-in ${accent ?? "border-ui-border-base"}`}>
    {header}
    {children}
  </div>
)

/* ---- Artifact / report ---- */

export const InlineArtifactCard = ({
  artifactId,
  payload,
}: {
  artifactId?: string
  payload: ArtifactPayload
}) => {
  const [tab, setTab] = useState<"report" | "table" | "chart" | "export">("report")

  const sections = payload?.sections ?? []
  const tables = sections.filter((s) => s.type === "table") as Array<Extract<ArtifactSection, { type: "table" }>>
  const charts = sections.filter((s) => s.type === "chart") as Array<Extract<ArtifactSection, { type: "chart" }>>
  const kpis = sections.filter((s) => s.type === "kpi") as Array<Extract<ArtifactSection, { type: "kpi" }>>
  const textSections = sections.filter((s) => s.type === "text") as Array<Extract<ArtifactSection, { type: "text" }>>

  const download = (format: "csv" | "markdown") => {
    if (!artifactId) return
    window.open(`/admin/kami/reports/${artifactId}/export?format=${format}`, "_blank")
  }

  return (
    <CardShell
      header={
        <div className="border-b border-ui-border-base px-3 py-2.5">
          <div className="min-w-0">
            <Text size="small" weight="plus" className="truncate text-ui-fg-base">
              {payload?.title ?? "KAMI Report"}
            </Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              {payload?.date_range?.label ?? "Current context"} · {payload?.utc_offset ?? "UTC+7"}
            </Text>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 rounded-md bg-ui-bg-subtle p-1">
            {(["report", "table", "chart", "export"] as const).map((item) => (
              <button
                key={item}
                className={`rounded px-2 py-1 text-xs capitalize ${tab === item ? "bg-ui-bg-base text-ui-fg-base shadow-sm" : "text-ui-fg-subtle hover:text-ui-fg-base"}`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="max-h-[420px] overflow-y-auto p-3">
        {tab === "report" && (
          <div className="space-y-3">
            {kpis.map((section, si) => (
              <div key={`kpi-${si}`} className="space-y-2">
                <Text size="small" weight="plus">{section.title}</Text>
                <div className="grid grid-cols-2 gap-2">
                  {section.cards.map((card, ci) => (
                    <div key={`${card.label}-${ci}`} className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
                      <Text size="xsmall" className="text-ui-fg-muted">{card.label}</Text>
                      <Text size="base" weight="plus" className="mt-1 text-ui-fg-base">{card.value}</Text>
                      {card.delta && <Text size="xsmall" className="text-ui-fg-subtle">{card.delta}</Text>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {textSections.map((section, i) => (
              <div key={`text-${i}`} className="rounded-md border border-ui-border-base p-3">
                {section.title && <Text size="small" weight="plus" className="mb-2">{section.title}</Text>}
                <KamiMarkdown text={section.content} />
              </div>
            ))}
            {(payload?.data_sources ?? []).length > 0 && (
              <div className="rounded-md border border-ui-border-base p-3">
                <Text size="small" weight="plus" className="mb-2">Sources</Text>
                <div className="space-y-1">
                  {(payload?.data_sources ?? []).map((source, i) => (
                    <div key={`${source.tool}-${i}`} className="flex items-center justify-between gap-x-3">
                      <Text size="xsmall" className="truncate text-ui-fg-subtle">{toolLabel(source.tool)}</Text>
                      <Text size="xsmall" className="text-ui-fg-muted">{source.row_count} rows</Text>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "table" && (
          <div className="space-y-3">
            {tables.length ? tables.map((section, si) => (
              <div key={`table-${si}`} className="space-y-2">
                <Text size="small" weight="plus">{section.title}</Text>
                <div className="overflow-x-auto rounded-md border border-ui-border-base">
                  <table className="min-w-full text-xs">
                    <thead className="bg-ui-bg-subtle">
                      <tr>
                        {section.columns.map((column) => (
                          <th key={column.key} className={`px-2 py-2 text-left font-medium ${column.align === "right" ? "text-right" : ""}`}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-ui-border-base">
                          {section.columns.map((column) => (
                            <td key={column.key} className={`px-2 py-2 ${column.align === "right" ? "text-right" : ""}`}>
                              {String(row[column.key] ?? "-")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted">{section.total_rows} rows</Text>
              </div>
            )) : <Text size="small" className="text-ui-fg-subtle">No table sections in this report.</Text>}
          </div>
        )}

        {tab === "chart" && (
          <div className="space-y-3">
            {charts.length ? charts.map((section, si) => {
              const values = section.data.datasets[0]?.values ?? []
              const max = Math.max(...values, 1)

              return (
                <div key={`chart-${si}`} className="rounded-md border border-ui-border-base p-3">
                  <Text size="small" weight="plus" className="mb-3">{section.title}</Text>
                  <div className="space-y-2">
                    {section.data.labels.map((label, i) => {
                      const value = values[i] ?? 0

                      return (
                        <div key={`${label}-${i}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-x-2">
                            <Text size="xsmall" className="truncate text-ui-fg-subtle">{label}</Text>
                            <Text size="xsmall" className="text-ui-fg-muted">{value}</Text>
                          </div>
                          <div className="h-2 rounded-full bg-ui-bg-subtle">
                            <div className="h-2 rounded-full bg-ui-fg-interactive" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }) : <Text size="small" className="text-ui-fg-subtle">No chart sections in this report.</Text>}
          </div>
        )}

        {tab === "export" && (
          <div className="space-y-2">
            <Button className="w-full" variant="secondary" size="small" onClick={() => download("csv")} disabled={!artifactId}>
              Download CSV
            </Button>
            <Button className="w-full" variant="secondary" size="small" onClick={() => download("markdown")} disabled={!artifactId}>
              Download Markdown
            </Button>
            <Text size="xsmall" className="text-ui-fg-subtle">
              CSV exports table sections. Markdown exports the full report summary.
            </Text>
          </div>
        )}
      </div>
    </CardShell>
  )
}

/* ---- Commerce draft ---- */

export const InlineDraftCard = ({
  artifactId,
  payload,
  liveDraft,
  onSave,
  onExecute,
  onDismiss,
}: {
  artifactId?: string
  payload: CommerceDraftPayload
  liveDraft?: Row
  onSave: (draft: Row, args: Row) => Promise<Row | null>
  onExecute: (draft: Row, args: Row) => Promise<void>
  onDismiss: (draft: Row) => Promise<void>
}) => {
  // Prefer the live draft (fresh status after save/execute + across reload).
  const effective = (liveDraft?.payload as CommerceDraftPayload | undefined) ?? payload
  const draftRow: Row = liveDraft ?? { id: artifactId, payload: effective }
  const [argsText, setArgsText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setArgsText(safeJson(effective?.args ?? {}))
    setError(null)
  }, [artifactId, liveDraft?.id])

  const locked = effective.status === "executed" || effective.status === "dismissed"

  const parseArgs = () => {
    try {
      const parsed = JSON.parse(argsText || "{}")
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Draft args must be a JSON object")
      }
      setError(null)
      return parsed as Row
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  const save = async () => {
    const args = parseArgs()
    if (!args || !draftRow.id) return
    setBusy(true)
    try {
      await onSave(draftRow, args)
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    const args = parseArgs()
    if (!args || !draftRow.id) return
    if (effective.confirm_required || effective.risk === "mutating" || effective.risk === "destructive") {
      if (!window.confirm(`Execute draft "${effective.title}" with tool ${effective.target_tool}?`)) return
    }
    setBusy(true)
    try {
      await onExecute(draftRow, args)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (!draftRow.id) return
    if (!window.confirm(`Dismiss draft "${effective.title}"?`)) return
    setBusy(true)
    try {
      await onDismiss(draftRow)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardShell
      accent="border-ui-tag-orange-border"
      header={
        <div className="border-b border-ui-border-base bg-ui-tag-orange-bg px-3 py-2.5">
          <div className="min-w-0">
            <Text size="small" weight="plus" className="truncate text-ui-fg-base">{effective.title}</Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              {effective.draft_type} · {effective.utc_offset ?? "UTC+7"}
            </Text>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge size="2xsmall" color={effective.status === "executed" ? "green" : effective.status === "approval_required" ? "orange" : effective.status === "error" ? "red" : "blue"}>
              {effective.status}
            </Badge>
            <Badge size="2xsmall" color={riskColor(effective.risk)}>{effective.risk}</Badge>
            <Badge size="2xsmall">{effective.target_tool}</Badge>
          </div>
        </div>
      }
    >
      <div className="space-y-3 p-3">
        {effective.description && (
          <Text size="small" className="whitespace-pre-wrap text-ui-fg-base">{effective.description}</Text>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Text size="xsmall" weight="plus" className="text-ui-fg-muted">Tool arguments</Text>
            <Text size="xsmall" className="text-ui-fg-muted">JSON</Text>
          </div>
          <Textarea
            value={argsText}
            onChange={(e: any) => setArgsText(e.target.value)}
            className="min-h-[160px] font-mono text-xs"
            disabled={busy || locked}
          />
          {error && <Text size="xsmall" className="text-ui-tag-red-text">{error}</Text>}
        </div>
        {effective.execution_result !== undefined && (
          <div className="rounded-md border border-ui-border-base p-2.5">
            <Text size="xsmall" weight="plus" className="mb-1 text-ui-fg-muted">Execution result</Text>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-ui-fg-subtle">
              {compact(effective.execution_result, 4000)}
            </pre>
          </div>
        )}
        {!locked && (
          <div className="flex items-center justify-between gap-x-2">
            <Button size="small" variant="danger" onClick={dismiss} disabled={busy}>Dismiss</Button>
            <div className="flex gap-x-2">
              <Button size="small" variant="secondary" onClick={save} disabled={busy}>Save</Button>
              <Button size="small" onClick={execute} disabled={busy}>Execute</Button>
            </div>
          </div>
        )}
      </div>
    </CardShell>
  )
}

/* ---- UI command (focus record / highlight issue / confirmation) ---- */

export const InlineUiCommandCard = ({ command }: { command: UiCommand }) => {
  const href = recordHref(command.record_type, command.record_id)
  const severity = command.severity ?? "info"

  return (
    <CardShell
      accent={severity === "critical" ? "border-ui-tag-red-border" : severity === "warning" ? "border-ui-tag-orange-border" : "border-ui-border-base"}
      header={
        <div className="border-b border-ui-border-base px-3 py-2.5">
          <div className="flex items-center gap-x-2">
            <Badge size="2xsmall" color={severity === "critical" ? "red" : severity === "warning" ? "orange" : "blue"}>
              {severity}
            </Badge>
            <Text size="small" weight="plus" className="truncate text-ui-fg-base">
              {command.title ?? "KAMI Focus"}
            </Text>
          </div>
        </div>
      }
    >
      <div className="space-y-2.5 p-3">
        {command.reason && (
          <Text size="small" className="whitespace-pre-wrap text-ui-fg-base">{command.reason}</Text>
        )}
        {command.record_id && (
          <div className="rounded-md bg-ui-bg-subtle p-2">
            <Text size="xsmall" weight="plus">Record</Text>
            <Text size="xsmall" className="break-all text-ui-fg-subtle">
              {command.record_type ?? "record"} · {command.record_id}
            </Text>
          </div>
        )}
        {href && (
          <Button size="small" variant="secondary" className="w-full" onClick={() => window.open(href, "_blank")}>
            Open record
          </Button>
        )}
      </div>
    </CardShell>
  )
}

/* ---- Human approval gate ---- */

export const InlineApprovalCard = ({
  approval,
  decided,
  onDecide,
}: {
  approval: Row
  decided?: "approved" | "rejected"
  onDecide: (id: string, status: "approved" | "rejected") => Promise<void>
}) => {
  const [busy, setBusy] = useState(false)
  const status: string = decided ?? approval.status ?? "pending"
  const settled = status === "approved" || status === "rejected"

  const decide = async (next: "approved" | "rejected") => {
    if (!approval.id) return
    setBusy(true)
    try {
      await onDecide(approval.id, next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardShell
      accent="border-ui-tag-orange-border"
      header={
        <div className="flex items-center gap-x-2 border-b border-ui-border-base bg-ui-tag-orange-bg px-3 py-2.5">
          <Text size="small" weight="plus" className="text-ui-fg-base">Approval required</Text>
          <Badge size="2xsmall" color={status === "approved" ? "green" : status === "rejected" ? "red" : "orange"}>
            {status}
          </Badge>
          {approval.risk && (
            <Badge size="2xsmall" color={riskColor(approval.risk)}>{approval.risk}</Badge>
          )}
        </div>
      }
    >
      <div className="space-y-2.5 p-3">
        <div>
          <Text size="xsmall" weight="plus" className="text-ui-fg-muted">Tool</Text>
          <Text size="small" className="font-mono text-ui-fg-base">{toolLabel(approval.tool ?? "unknown")}</Text>
        </div>
        {approval.args && Object.keys(approval.args).length > 0 && (
          <pre className="max-h-40 overflow-auto rounded bg-ui-bg-subtle px-2.5 py-2 font-mono text-[11px] text-ui-fg-subtle">
            {safeJson(approval.args)}
          </pre>
        )}
        {settled ? (
          <div className="flex items-center gap-x-1.5">
            {status === "approved" ? (
              <CheckCircleSolid className="text-ui-tag-green-icon" />
            ) : (
              <XCircleSolid className="text-ui-tag-red-icon" />
            )}
            <Text size="xsmall" className="text-ui-fg-subtle">
              {status === "approved" ? "Approved — the turn continued." : "Rejected."}
            </Text>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-x-2">
            <Button size="small" variant="danger" onClick={() => decide("rejected")} disabled={busy}>Reject</Button>
            <Button size="small" onClick={() => decide("approved")} disabled={busy}>Approve</Button>
          </div>
        )}
      </div>
    </CardShell>
  )
}
