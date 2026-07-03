import { Badge, Button, Drawer, Input, Text, Textarea } from "@medusajs/ui"
import type { Row, TabId } from "./types"
import {
  compact,
  formatDate,
  getMemoryCategory,
  isMemoryDisabled,
  riskColor,
} from "./helpers"

/* ------------------------------------------------------------------ */
/*  Panel: Drawers for Admin Tabs                                      */
/* ------------------------------------------------------------------ */

export const AdminDrawer = ({
  tab,
  open,
  onClose,
  loadData,
  sessions, skills, approvals, auditLogs, jobs, memories, gateways, settings, health,
  memoryQuery, setMemoryQuery, memoryDraft, setMemoryDraft, searchMemory, addMemory,
  editingMemoryId, setEditingMemoryId, memoryEditDraft, setMemoryEditDraft,
  startMemoryEdit, saveMemoryEdit, deleteMemory, toggleMemoryDisabled,
  cronDraft, setCronDraft, createCronJob, decideApproval, reportTemplates,
  runReportTemplate, scheduleTemplate, autonomy, evalResult, evalRunning, runEvaluation,
}: {
  tab: TabId | null
  open: boolean
  onClose: () => void
  loadData: () => Promise<void>
  [key: string]: any
}) => {
  const title = {
    approvals: "Approvals", audit: "Audit Log", memory: "Memory",
    skills: "Skills", cron: "Cron Jobs", gateways: "Gateways", settings: "Settings",
    autonomy: "Autonomy", evals: "Evaluations",
  }[tab ?? ""] ?? ""

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{title}</Drawer.Title>
        </Drawer.Header>
        {/* min-h-0 + overflow-y-auto: Drawer.Body defaults to flex-1 only (no overflow),
            so long content (Cron/Memory/Settings) overflows without scrolling. */}
        <Drawer.Body className="min-h-0 space-y-4 overflow-y-auto px-4" data-kami-drawer-body>
          {tab === "approvals" && (
            <div className="space-y-2">
              {approvals?.length ? approvals.map((a: Row) => (
                <div key={a.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge>{a.tool}</Badge>
                    <Badge color={a.status === "pending" ? "orange" : a.status === "approved" ? "green" : "red"}>
                      {a.status}
                    </Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{compact(a.args)}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">{formatDate(a.requested_at)}</Text>
                  {a.status === "pending" && (
                    <div className="flex gap-x-2 mt-2">
                      <Button size="small" variant="secondary" onClick={() => decideApproval(a.id, "rejected")}>Reject</Button>
                      <Button size="small" onClick={() => decideApproval(a.id, "approved")}>Approve</Button>
                    </div>
                  )}
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No pending approvals</Text>}
            </div>
          )}

          {tab === "audit" && (
            <div className="space-y-2">
              {auditLogs?.length ? auditLogs.map((log: Row) => (
                <div key={log.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Badge color={riskColor(log.risk_level)}>{log.risk_level}</Badge>
                    <Badge>{log.actor ?? "kami"}</Badge>
                    <Text size="xsmall" weight="plus">{log.tool}</Text>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{log.result_summary ?? "-"}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">{formatDate(log.created_at)}</Text>
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No audit logs</Text>}
            </div>
          )}

          {tab === "memory" && (
            <div className="space-y-4">
              <div className="flex gap-x-2">
                <Input
                  placeholder="Search memories..."
                  value={memoryQuery}
                  onChange={(e: any) => setMemoryQuery(e.target.value)}
                  onKeyDown={(e: any) => e.key === "Enter" && searchMemory()}
                />
                <Button size="small" variant="secondary" onClick={searchMemory}>Search</Button>
              </div>
              <div className="border-t border-ui-border-base pt-3 space-y-2">
                <Text size="xsmall" weight="plus">Add memory</Text>
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={memoryDraft.type}
                  onChange={(e) => setMemoryDraft((d: any) => ({ ...d, type: e.target.value }))}>
                  {["factual", "preference", "goal", "instruction", "event"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={memoryDraft.category}
                  onChange={(e) => setMemoryDraft((d: any) => ({ ...d, category: e.target.value }))}>
                  {["preference", "shop_rule", "operational", "goal", "forbidden"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Textarea
                  value={memoryDraft.content}
                  onChange={(e: any) => setMemoryDraft((d: any) => ({ ...d, content: e.target.value }))}
                  placeholder="Remember that..."
                />
                <Button size="small" onClick={addMemory}>Store</Button>
              </div>
              <div className="space-y-2">
                {memories?.length ? memories.map((m: Row) => (
                  <div key={m.id} className="rounded-lg border border-ui-border-base p-3">
                    {editingMemoryId === m.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select className="h-8 rounded-md border border-ui-border-base px-2 text-sm"
                            value={memoryEditDraft.type}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, type: e.target.value }))}>
                            {["factual", "preference", "goal", "instruction", "event"].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <select className="h-8 rounded-md border border-ui-border-base px-2 text-sm"
                            value={memoryEditDraft.category}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, category: e.target.value }))}>
                            {["preference", "shop_rule", "operational", "goal", "forbidden"].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <Textarea
                          value={memoryEditDraft.content}
                          onChange={(e: any) => setMemoryEditDraft((d: any) => ({ ...d, content: e.target.value }))}
                        />
                        <label className="flex items-center gap-x-2 text-xs text-ui-fg-subtle">
                          <input
                            type="checkbox"
                            checked={memoryEditDraft.disabled}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, disabled: e.target.checked }))}
                          />
                          Disabled
                        </label>
                        <div className="flex justify-end gap-x-2">
                          <Button size="small" variant="secondary" onClick={() => setEditingMemoryId(null)}>Cancel</Button>
                          <Button size="small" onClick={saveMemoryEdit}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-x-2 mb-1">
                          <Badge>{getMemoryCategory(m)}</Badge>
                          <Badge color={isMemoryDisabled(m) ? "grey" : "green"}>{isMemoryDisabled(m) ? "disabled" : "active"}</Badge>
                          <Text size="xsmall" className="text-ui-fg-muted">importance {m.importance ?? 1}</Text>
                        </div>
                        <Text size="small" className="whitespace-pre-wrap">{m.content}</Text>
                        <div className="mt-2 flex justify-end gap-x-1.5">
                          <Button size="small" variant="transparent" onClick={() => startMemoryEdit(m)}>Edit</Button>
                          <Button size="small" variant="transparent" onClick={() => toggleMemoryDisabled(m)}>
                            {isMemoryDisabled(m) ? "Enable" : "Disable"}
                          </Button>
                          <Button size="small" variant="danger" onClick={() => deleteMemory(m)}>Delete</Button>
                        </div>
                      </>
                    )}
                  </div>
                )) : <Text size="small" className="text-ui-fg-subtle">No memories</Text>}
              </div>
            </div>
          )}

          {tab === "skills" && (
            <div className="space-y-2">
              {skills?.length ? skills.map((s: Row) => (
                <div key={s.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Text size="small" weight="plus">{s.name}</Text>
                    <Badge>{s.category ?? "-"}</Badge>
                    <Badge>{s.origin ?? "human"}</Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{s.description ?? "-"}</Text>
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No skills</Text>}
            </div>
          )}

          {tab === "cron" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Text size="xsmall" weight="plus">Report templates</Text>
                {reportTemplates?.length ? reportTemplates.map((template: Row) => (
                  <div key={template.id} className="rounded-lg border border-ui-border-base p-3">
                    <div className="flex items-start justify-between gap-x-3">
                      <div className="min-w-0">
                        <Text size="small" weight="plus" className="truncate">{template.title}</Text>
                        <Text size="xsmall" className="line-clamp-2 text-ui-fg-subtle">{template.description}</Text>
                      </div>
                      <Badge>{template.category ?? "general"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      <Button size="small" variant="secondary" onClick={() => runReportTemplate(template)}>Run</Button>
                      {(template.schedule_presets?.length ? template.schedule_presets : [{ label: "Every morning 8:00", schedule: "0 8 * * *" }]).slice(0, 2).map((preset: Row) => (
                        <Button key={preset.label} size="small" variant="transparent" onClick={() => scheduleTemplate(template, preset)}>
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )) : <Text size="small" className="text-ui-fg-subtle">No report templates</Text>}
              </div>

              <div className="border rounded-lg border-ui-border-base p-3 space-y-3">
                <Text size="xsmall" weight="plus">Create job</Text>
                <Input placeholder="Job name" value={cronDraft.name}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, name: e.target.value }))} />
                <Textarea placeholder="Prompt KAMI should run..." value={cronDraft.prompt}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, prompt: e.target.value }))} />
                <Input placeholder="Schedule (e.g. @daily)" value={cronDraft.schedule}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, schedule: e.target.value }))} />
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={cronDraft.deliver}
                  onChange={(e) => setCronDraft((d: any) => ({ ...d, deliver: e.target.value }))}>
                  <option value="audit">Audit only</option>
                  <option value="session">Session</option>
                </select>
                <Button size="small" onClick={createCronJob}>Create</Button>
              </div>
              {jobs?.length ? jobs.map((j: Row) => (
                <div key={j.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Text size="small" weight="plus">{j.name}</Text>
                    <Badge>{j.enabled ? "active" : "paused"}</Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{j.metadata?.schedule_label ?? j.schedule}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Next: {formatDate(j.next_run_at)} · Last: {formatDate(j.last_run_at)}
                  </Text>
                  {j.metadata?.run_history?.length > 0 && (
                    <div className="mt-2 rounded-md bg-ui-bg-subtle p-2">
                      <Text size="xsmall" weight="plus" className="mb-1">Run history</Text>
                      {j.metadata.run_history.slice(0, 3).map((run: Row, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-x-2">
                          <Text size="xsmall" className="text-ui-fg-subtle">{formatDate(run.run_at)}</Text>
                          <Text size="xsmall" className="text-ui-fg-muted">{run.status}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No scheduled jobs</Text>}
            </div>
          )}

          {tab === "gateways" && (
            <div className="space-y-2">
              {gateways?.length ? gateways.map((gw: Row) => (
                <div key={gw.id} className="rounded-lg border border-ui-border-base p-3 flex items-center justify-between">
                  <div>
                    <Text size="small" weight="plus">{gw.label}</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle"><code>{gw.webhook_path}</code></Text>
                  </div>
                  <Badge color={gw.configured ? "green" : "grey"} size="small">
                    {gw.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
              )) : (
                <div className="space-y-2">
                  <Text size="small" className="text-ui-fg-subtle">No gateways configured. Set env vars and restart.</Text>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text size="small" weight="plus">Telegram</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">Set KAMI_GATEWAY_TELEGRAM_TOKEN</Text>
                  </div>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text size="small" weight="plus">Discord</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">Set KAMI_GATEWAY_DISCORD_TOKEN + KAMI_GATEWAY_DISCORD_PUBLIC_KEY</Text>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="space-y-3">
              {settings && Object.entries(settings)
                .filter(([k]) => !["model", "primary_model", "fallback_model", "fallbackModel", "baseUrl"].includes(k))
                .map(([k, v]) => (
                <div key={k} className="rounded-lg border border-ui-border-base p-3">
                  <Text size="small" weight="plus">{k}</Text>
                  <Text size="small" className="break-words text-ui-fg-subtle">{compact(String(v), 180)}</Text>
                </div>
              ))}
              {health && (
                <div className="rounded-lg border border-ui-border-base p-3">
                  <Text size="small" weight="plus">Provider Health</Text>
                  <Badge color={health.healthy ? "green" : "red"}>{health.healthy ? "healthy" : "unhealthy"}</Badge>
                </div>
              )}
            </div>
          )}

          {tab === "autonomy" && (
            <div className="space-y-3">
              {autonomy ? (
                <>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <div className="mb-1 flex items-center justify-between gap-x-2">
                      <Text size="small" weight="plus">Mode</Text>
                      <Badge>{autonomy.mode}</Badge>
                    </div>
                    <Text size="small" className="text-ui-fg-subtle">{autonomy.description}</Text>
                    <Text size="xsmall" className="mt-2 text-ui-fg-muted">
                      Max mutations per turn: {autonomy.max_mutations_per_turn}
                    </Text>
                  </div>
                  <div className="space-y-2">
                    {(autonomy.policies ?? []).map((policy: Row) => (
                      <div key={policy.risk} className="rounded-lg border border-ui-border-base p-3">
                        <div className="flex items-center justify-between gap-x-2">
                          <Text size="small" weight="plus">{policy.risk}</Text>
                          <Badge color={policy.approval_required ? "orange" : "green"}>
                            {policy.approval_required ? "approval" : "direct"}
                          </Badge>
                        </div>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          Direct execution: {policy.direct ? "yes" : "no"}
                        </Text>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">Autonomy policy is not loaded.</Text>
              )}
            </div>
          )}

          {tab === "evals" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-ui-border-base p-3">
                <div className="flex items-start justify-between gap-x-3">
                  <div>
                    <Text size="small" weight="plus">Deterministic Harness</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Registry, report artifacts, quick actions, and autonomy policy.
                    </Text>
                  </div>
                  <Button size="small" variant="secondary" disabled={evalRunning} onClick={runEvaluation}>
                    {evalRunning ? "Running" : "Run"}
                  </Button>
                </div>
              </div>
              {evalResult ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <div className="flex items-center justify-between gap-x-2">
                      <Text size="small" weight="plus">Result</Text>
                      <Badge color={evalResult.totals?.failed ? "red" : "green"}>
                        {evalResult.totals?.passed ?? 0}/{evalResult.totals?.checks ?? 0} passed
                      </Badge>
                    </div>
                    <Text size="xsmall" className="text-ui-fg-muted">{formatDate(evalResult.generated_at)}</Text>
                  </div>
                  {(evalResult.checks ?? []).map((item: Row) => (
                    <div key={item.id} className="rounded-lg border border-ui-border-base p-3">
                      <div className="flex items-center justify-between gap-x-2">
                        <Text size="xsmall" weight="plus">{item.id}</Text>
                        <Badge color={item.passed ? "green" : "red"}>
                          {item.passed ? "pass" : "fail"}
                        </Badge>
                      </div>
                      <Text size="xsmall" className="break-words text-ui-fg-subtle">{compact(item.details, 220)}</Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">No evaluation run yet.</Text>
              )}
            </div>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
