/**
 * Convert a natural-language schedule description into a cron expression
 * (or Medusa @interval string) that `kami-cron-tick` understands.
 *
 * Supported natural-language patterns:
 *   "every morning at 9am"      -> 0 9 star star star
 *   "every day at 5pm"          -> 0 17 star star star
 *   "every monday at 8am"       -> 0 8 star star 1
 *   "every weekday at 10am"     -> 0 10 star star 1-5
 *   "every hour"                -> 0 star star star star
 *   "every 30 minutes"          -> [star]/30 star star star star
 *   "every 2 hours"             -> 0 [star]/2 star star star
 *   "at midnight"               -> 0 0 star star star
 *   "every friday at 3pm"       -> 0 15 star star 5
 *
 * Also accepted: plain cron strings ("0 9 star star star"), Medusa intervals
 * ("@daily", "@hourly"), and relative shorthand ("every 15 minutes").
 */
const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const HOUR_MAP: Record<string, number> = {
  midnight: 0,
  noon: 12,
}

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

type ScheduleResult = {
  /** Cron expression (five-field) recognized by the cron tick parser. */
  cron: string
  /** Human-readable label for display in the admin UI. */
  label: string
  /** Whether the input was recognized. false → fallback cron used instead. */
  recognized: boolean
}

const ampmTo24h = (hour: number, ampm: string): number => {
  if (ampm === "pm" && hour < 12) {
    return hour + 12
  }

  if (ampm === "am" && hour === 12) {
    return 0
  }

  return hour
}

const parseHour = (input: string): { hour: number; ampm: string } | null => {
  const match = input.match(/(\d{1,2})(\s*)(am|pm)/i)

  if (match) {
    return { hour: parseInt(match[1], 10), ampm: match[3].toLowerCase() }
  }

  return null
}

/**
 * Try to parse a natural-language schedule string into a 5-field cron
 * expression. Falls back to the original `input` (stripped) when no
 * pattern matches — the cron-tick already handles @hourly / @daily /
 * every-N-* patterns, so unrecognized strings still work if they match
 * those formats.
 */
export const parseSchedule = (input: string): ScheduleResult => {
  const raw = input.trim()
  const lower = raw.toLowerCase()

  // --- Already a cron expression (5 space-separated fields) -----------------
  const cronMatch = lower.match(
    /^[*\d/\-,]+\s+[*\d/\-,]+\s+[*\d/\-,]+\s+[*\d/\-,]+\s+[*\d/\-,]+$/
  )

  if (cronMatch) {
    return { cron: lower, label: raw, recognized: true }
  }

  // --- Built-in intervals recognised by cron-tick --------------------------
  if (lower === "@hourly") {
    return { cron: "@hourly", label: "Every hour", recognized: true }
  }

  if (lower === "@daily" || lower === "daily" || lower === "every day") {
    return { cron: "@daily", label: "Every day", recognized: true }
  }

  // --- Every N minutes / hours / days ------------------------------------
  const everyNMatch = lower.match(
    /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/
  )

  if (everyNMatch) {
    const count = parseInt(everyNMatch[1], 10)
    const unit = everyNMatch[2]

    if (unit.startsWith("minute")) {
      return {
        cron: `*/${count} * * * *`,
        label: `Every ${count} minute${count > 1 ? "s" : ""}`,
        recognized: true,
      }
    }

    if (unit.startsWith("hour")) {
      return {
        cron: `0 */${count} * * *`,
        label: `Every ${count} hour${count > 1 ? "s" : ""}`,
        recognized: true,
      }
    }

    return {
      cron: `0 0 */${count} * *`,
      label: `Every ${count} day${count > 1 ? "s" : ""}`,
      recognized: true,
    }
  }

  // --- "every hour" -------------------------------------------------------
  if (lower === "every hour" || lower === "hourly") {
    return { cron: "0 * * * *", label: "Every hour", recognized: true }
  }

  // --- "daily at HH:MM" / "every day at HH:MM" ---------------------------
  const dailyAtMatch = lower.match(
    /(?:every\s+day\s+at|daily\s+at)\s+(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?/i
  )

  if (dailyAtMatch) {
    const hour = ampmTo24h(
      parseInt(dailyAtMatch[1], 10),
      dailyAtMatch[3] ?? "am"
    )
    const minute = parseInt(dailyAtMatch[2] ?? "0", 10)

    return {
      cron: `${minute} ${hour} * * *`,
      label: `Every day at ${hour}:${String(minute).padStart(2, "0")}`,
      recognized: true,
    }
  }

  // --- "every morning at H am/pm" / "every morning at H" ------------------
  const morningMatch = lower.match(
    /every\s+morning\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?/i
  )

  if (morningMatch) {
    const hour = ampmTo24h(
      parseInt(morningMatch[1], 10),
      morningMatch[3] ?? "am"
    )
    const minute = parseInt(
      (morningMatch[2] ?? ":00").replace(":", ""),
      10
    )

    return {
      cron: `${minute} ${hour} * * *`,
      label: `Every morning at ${hour}:${String(minute).padStart(2, "0")}`,
      recognized: true,
    }
  }

  // --- Day-of-week: "every <day> at H am/pm" -----------------------------
  const dayMatch = lower.match(
    /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?/i
  )

  if (dayMatch) {
    const day = DAY_MAP[dayMatch[1]]
    const hour = ampmTo24h(
      parseInt(dayMatch[2], 10),
      dayMatch[4] ?? "am"
    )
    const minute = parseInt(
      (dayMatch[3] ?? ":00").replace(":", ""),
      10
    )

    return {
      cron: `${minute} ${hour} * * ${day}`,
      label: `Every ${dayMatch[1]} at ${hour}:${String(minute).padStart(2, "0")}`,
      recognized: true,
    }
  }

  // --- "every weekday at H am/pm" ----------------------------------------
  const weekdayMatch = lower.match(
    /every\s+weekday\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?/i
  )

  if (weekdayMatch) {
    const hour = ampmTo24h(
      parseInt(weekdayMatch[1], 10),
      weekdayMatch[3] ?? "am"
    )
    const minute = parseInt(
      (weekdayMatch[2] ?? ":00").replace(":", ""),
      10
    )

    return {
      cron: `${minute} ${hour} * * 1-5`,
      label: `Every weekday at ${hour}:${String(minute).padStart(2, "0")}`,
      recognized: true,
    }
  }

  // --- "at midnight" / "at noon" -----------------------------------------
  const namedHour = lower.match(/at\s+(midnight|noon)/)

  if (namedHour) {
    const hour = HOUR_MAP[namedHour[1]]

    return {
      cron: `0 ${hour} * * *`,
      label: `Every day at ${namedHour[1]}`,
      recognized: true,
    }
  }

  // --- "every H am/pm" (bare hour, assumed daily) ------------------------
  const hourMatch = lower.match(
    /every\s+(\d{1,2})(:\d{2})?\s*(am|pm)/i
  )

  if (hourMatch) {
    const hour = ampmTo24h(
      parseInt(hourMatch[1], 10),
      hourMatch[3] ?? "am"
    )
    const minute = parseInt(
      (hourMatch[2] ?? ":00").replace(":", ""),
      10
    )

    return {
      cron: `${minute} ${hour} * * *`,
      label: `Every day at ${hour}:${String(minute).padStart(2, "0")}`,
      recognized: true,
    }
  }

  // --- Fallthrough: pass the original string to the cron-tick parser -----
  // The cron-tick already handles `@hourly`, `@daily`, `every N *`, and
  // `*/N * * * *` patterns, so unrecognized strings will degrade gracefully.
  return { cron: raw, label: raw, recognized: false }
}

export { DAY_MAP, HOUR_MAP, MONTH_MAP }
export type { ScheduleResult }
