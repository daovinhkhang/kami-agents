import type { ArtifactPayload } from "./types"

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "")

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`
  }

  return text
}

export const artifactToCsv = (payload: ArtifactPayload) => {
  const blocks: string[] = []

  for (const section of payload.sections) {
    if (section.type !== "table") {
      continue
    }

    blocks.push(section.title)
    blocks.push(section.columns.map((column) => escapeCsv(column.label)).join(","))

    for (const row of section.rows) {
      blocks.push(section.columns.map((column) => escapeCsv(row[column.key])).join(","))
    }

    blocks.push("")
  }

  if (!blocks.length) {
    blocks.push("title,value")
    blocks.push(`${escapeCsv(payload.title)},${escapeCsv(payload.generated_at)}`)
  }

  return blocks.join("\n")
}

export const artifactToMarkdown = (payload: ArtifactPayload) => {
  const lines = [`# ${payload.title}`, "", `Generated: ${payload.generated_at}`, ""]

  for (const section of payload.sections) {
    lines.push(`## ${section.title ?? section.type}`)

    if (section.type === "text") {
      lines.push(section.content, "")
    }

    if (section.type === "kpi") {
      for (const card of section.cards) {
        lines.push(`- ${card.label}: ${card.value}${card.delta ? ` (${card.delta})` : ""}`)
      }
      lines.push("")
    }

    if (section.type === "table") {
      lines.push(`| ${section.columns.map((column) => column.label).join(" | ")} |`)
      lines.push(`| ${section.columns.map(() => "---").join(" | ")} |`)
      for (const row of section.rows) {
        lines.push(`| ${section.columns.map((column) => String(row[column.key] ?? "")).join(" | ")} |`)
      }
      lines.push("")
    }

    if (section.type === "chart") {
      lines.push(`Chart: ${section.chart_type}`)
      lines.push("")
    }
  }

  return lines.join("\n")
}
