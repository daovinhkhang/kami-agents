import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseSchedule } from "@kami/cron/schedule-parser"

const minute = 60 * 1000
const hour = 60 * minute
const day = 24 * hour

const nextRunAt = (schedule: string, from = new Date()) => {
  const normalized = schedule.trim().toLowerCase()

  if (normalized === "@hourly") return new Date(from.getTime() + hour)
  if (normalized === "@daily") return new Date(from.getTime() + day)

  const every = normalized.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/)
  if (every) {
    const count = Number(every[1])
    const unit = every[2]
    if (unit.startsWith("minute")) return new Date(from.getTime() + count * minute)
    if (unit.startsWith("hour")) return new Date(from.getTime() + count * hour)
    return new Date(from.getTime() + count * day)
  }

  const cronMinutes = normalized.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/)
  if (cronMinutes) return new Date(from.getTime() + Number(cronMinutes[1]) * minute)

  const fields = normalized.split(/\s+/)
  if (fields.length === 5) {
    const target = new Date(from)
    target.setSeconds(0, 0)
    target.setMinutes(target.getMinutes() + 1)

    for (let i = 0; i < 525600; i++) {
      const [m, h, dom, mon, dow] = fields
      const matches = (field: string, value: number) =>
        field === "*" ||
        field === String(value) ||
        (field.startsWith("*/") && value % Number(field.slice(2)) === 0)

      if (
        matches(m, target.getMinutes()) &&
        matches(h, target.getHours()) &&
        matches(dom, target.getDate()) &&
        matches(mon, target.getMonth() + 1) &&
        matches(dow, target.getDay())
      ) {
        return target
      }

      target.setMinutes(target.getMinutes() + 1)
    }
  }

  return new Date(from.getTime() + minute)
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const parsed = parseSchedule(String(body.schedule ?? body.schedule_description ?? ""))
  const next = nextRunAt(parsed.cron)

  res.json({
    schedule: parsed.cron,
    label: parsed.label,
    recognized: parsed.recognized,
    next_run_at: next.toISOString(),
    timezone: "Asia/Ho_Chi_Minh",
    utc_offset: "UTC+7",
  })
}
