import type { ScheduledJobHandler } from "@medusajs/framework/jobs"
import { runTurn } from "../kami-runtime"
import { getKamiConfig } from "../kami-runtime/config"
import type KamiModuleService from "../modules/kami/services/kami-module-service"

const minute = 60 * 1000
const hour = 60 * minute
const day = 24 * hour

const isDue = (job: any, now: Date) => {
  if (!job.enabled) {
    return false
  }

  if (!job.next_run_at) {
    return true
  }

  return new Date(job.next_run_at).getTime() <= now.getTime()
}

/**
 * Parse a single cron field into a set of allowed values.
 * Supports: `*`, `[star]/N` (step), `N` (literal), `N-M` (range), list.
 * Returns `null` for `*` (no constraint).
 */
const parseField = (field: string, min: number, max: number): number[] | null => {
  const trimmed = field.trim()

  if (trimmed === "*") {
    return null
  }

  const values = new Set<number>()

  for (const part of trimmed.split(",")) {
    const stepMatch = part.match(/^\*\/(\d+)$/)

    if (stepMatch) {
      const step = Number(stepMatch[1])

      for (let v = min; v <= max; v += step) {
        values.add(v)
      }

      continue
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/)

    if (rangeMatch) {
      const lo = Number(rangeMatch[1])
      const hi = Number(rangeMatch[2])

      for (let v = lo; v <= hi; v++) {
        values.add(v)
      }

      continue
    }

    const num = Number(part)

    if (Number.isFinite(num) && num >= min && num <= max) {
      values.add(num)
    }
  }

  if (values.size === 0) {
    return null
  }

  return [...values].sort((a, b) => a - b)
}

const fieldMatches = (value: number, allowed: number[] | null): boolean => {
  if (allowed === null) {
    return true
  }

  return allowed.includes(value)
}

const nextMatch = (
  allowed: number[] | null,
  current: number,
  max: number,
  wrap: boolean
): { value: number; wrapped: boolean } => {
  if (allowed === null) {
    return { value: current, wrapped: false }
  }

  for (const v of allowed) {
    if (v >= current) {
      return { value: v, wrapped: false }
    }
  }

  return { value: allowed[0], wrapped: wrap }
}

/**
 * Parse a 5-field cron expression and return the next run time.
 * Handles standard cron syntax: minute hour day-of-month month day-of-week.
 * Also handles shorthand: `@hourly`, `@daily`, `every N minutes/hours/days`,
 * and `[star]/N star star star star` patterns.
 */
const nextCronTime = (schedule: string, from: Date): Date => {
  const normalized = schedule.trim().toLowerCase()

  // --- Shorthand intervals -------------------------------------------------
  if (normalized === "@hourly") {
    return new Date(from.getTime() + hour)
  }

  if (normalized === "@daily") {
    return new Date(from.getTime() + day)
  }

  const every = normalized.match(
    /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/
  )

  if (every) {
    const count = Number(every[1])
    const unit = every[2]

    if (unit.startsWith("minute")) {
      return new Date(from.getTime() + count * minute)
    }

    if (unit.startsWith("hour")) {
      return new Date(from.getTime() + count * hour)
    }

    return new Date(from.getTime() + count * day)
  }

  const cronMinutes = normalized.match(
    /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/
  )

  if (cronMinutes) {
    return new Date(from.getTime() + Number(cronMinutes[1]) * minute)
  }

  // --- 5-field cron --------------------------------------------------------
  const fields = normalized.split(/\s+/)

  if (fields.length !== 5) {
    // Unrecognized format — run once per minute so it doesn't get stuck.
    return new Date(from.getTime() + minute)
  }

  const minuteAllowed = parseField(fields[0], 0, 59)
  const hourAllowed = parseField(fields[1], 0, 23)
  const domAllowed = parseField(fields[2], 1, 31)
  const monthAllowed = parseField(fields[3], 1, 12)
  const dowAllowed = parseField(fields[4], 0, 6)

  // Start from the minute after `from`, then iterate forward matching each
  // field. The search is bounded to 366 days ahead to prevent infinite loops.
  const candidate = new Date(from.getTime())
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  const deadline = new Date(candidate.getTime() + 366 * day)
  let iterations = 0

  while (candidate.getTime() <= deadline.getTime() && iterations++ < 525600) {
    const minute = candidate.getMinutes()
    const hour = candidate.getHours()
    const dom = candidate.getDate()
    const month = candidate.getMonth() + 1
    const dow = candidate.getDay()

    // Month check first — if the current month is not allowed, skip to the
    // first matching month.
    if (!fieldMatches(month, monthAllowed)) {
      const next = nextMatch(monthAllowed, month + 1, 12, true)

      if (next.wrapped) {
        candidate.setFullYear(candidate.getFullYear() + 1)
        candidate.setMonth(0)
      } else {
        candidate.setMonth(next.value - 1)
      }

      candidate.setDate(1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }

    // Day-of-month and day-of-week both constrain the day. Standard cron
    // treats dom+dow as OR (not AND), but we simplify to dom by itself.
    if (!fieldMatches(dom, domAllowed)) {
      candidate.setDate(dom + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }

    // Day-of-week constraint.
    if (!fieldMatches(dow, dowAllowed)) {
      candidate.setDate(dom + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }

    if (!fieldMatches(hour, hourAllowed)) {
      const next = nextMatch(hourAllowed, hour + 1, 23, true)

      if (next.wrapped) {
        candidate.setDate(dom + 1)
        candidate.setHours(0, 0, 0, 0)
      } else {
        candidate.setHours(next.value, 0, 0, 0)
      }

      continue
    }

    if (!fieldMatches(minute, minuteAllowed)) {
      const next = nextMatch(minuteAllowed, minute + 1, 59, true)

      if (next.wrapped) {
        candidate.setHours(hour + 1, 0, 0, 0)
      } else {
        candidate.setMinutes(next.value, 0, 0)
      }

      continue
    }

    return candidate
  }

  // Fallback: default to 1 minute from now.
  return new Date(from.getTime() + minute)
}

const nextRunAt = (schedule: string, from: Date) => {
  return nextCronTime(schedule, from)
}

const consumeTurn = async (job: any, container: any, kami: KamiModuleService) => {
  const events: any[] = []
  let resolvedSessionId: string | null = null

  for await (const event of runTurn(
    {
      sessionId: job.session_id ?? undefined,
      message: job.prompt,
      source: "cron",
      toolset: "admin",
    },
    {
      scope: container,
      kami,
    }
  )) {
    events.push(event)
    // Capture the real session ID from the first session event
    if (event.type === "session" && event.session_id && !resolvedSessionId) {
      resolvedSessionId = event.session_id
    }
  }

  return { events, resolvedSessionId }
}

const handler: ScheduledJobHandler = async (container, context) => {
  const config = getKamiConfig()

  if (config.halt) {
    return { skipped: true, reason: "halted_by_env" }
  }

  const kami = container.resolve("kami") as KamiModuleService
  const now = context?.scheduledFor ?? new Date()
  const jobs = await kami.listKamiJobs(
    { enabled: true },
    { take: 50, order: { next_run_at: "ASC" } }
  )
  const due = jobs.filter((job: any) => isDue(job, now))
  const results: any[] = []

  for (const job of due) {
    const startedAt = Date.now()
    const { events, resolvedSessionId } = await consumeTurn(job, container, kami)
    const done = [...events].reverse().find((event: any) => event.type === "done")
    const artifact = [...events].reverse().find((event: any) => event.type === "artifact_done")
    const runHistory = Array.isArray(job.metadata?.run_history)
      ? job.metadata.run_history
      : []

    // Auto-repair: if the original session was deleted and a new one was
    // created, update the job's session_id so subsequent runs don't fail.
    const effectiveSessionId = resolvedSessionId ?? job.session_id
    const updatePayload: any = {
      id: job.id,
      last_run_at: now,
      next_run_at: nextRunAt(job.schedule, now),
      metadata: {
        ...(job.metadata ?? {}),
        run_history: [
          {
            run_at: now.toISOString(),
            duration_ms: Date.now() - startedAt,
            status: done?.reason === "halted" ? "halted" : "completed",
            artifact_id: artifact?.artifact_id ?? null,
            session_id: effectiveSessionId ?? null,
          },
          ...runHistory,
        ].slice(0, 20),
      },
    }

    // If the session was recreated, persist the new session_id on the job
    if (resolvedSessionId && resolvedSessionId !== job.session_id) {
      updatePayload.session_id = resolvedSessionId
    }

    await kami.updateKamiJobs(updatePayload)

    await kami.createKamiAuditLogs([
      {
        session_id: job.session_id ?? null,
        tool: "kami-cron-tick",
        args: {
          job_id: job.id,
          name: job.name,
          schedule: job.schedule,
        },
        result_summary: JSON.stringify(done ?? { type: "done" }).slice(0, 1000),
        risk_level: "safe",
        actor: "kami",
      },
    ])

    results.push({
      job_id: job.id,
      event_count: events.length,
      done,
    })
  }

  return {
    checked: jobs.length,
    ran: results.length,
    scheduled_for: now.toISOString(),
    results,
  }
}

export default handler

export const config = {
  name: "kami-cron-tick",
  schedule: "* * * * *",
}
