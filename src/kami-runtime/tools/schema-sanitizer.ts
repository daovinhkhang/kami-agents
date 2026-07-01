const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const next: Record<string, unknown> = {}

  for (const [key, nested] of Object.entries(value)) {
    if (key === "pattern") {
      continue
    }

    if (key === "anyOf" && Array.isArray(nested)) {
      const nonNull = nested.filter(
        (item) =>
          !(
            item &&
            typeof item === "object" &&
            "type" in item &&
            item.type === "null"
          )
      )

      if (nonNull.length === 1) {
        Object.assign(next, sanitizeValue(nonNull[0]))
        continue
      }
    }

    next[key] = sanitizeValue(nested)
  }

  return next
}

export const sanitizeSchema = (schema: Record<string, unknown>) => {
  return sanitizeValue(schema) as Record<string, unknown>
}
