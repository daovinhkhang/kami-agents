import type { KamiCtx, KamiToolRisk } from "../types"

type JsonSchema = Record<string, unknown>

export type ToolDefinition = {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: JsonSchema
  }
}

/** Structured diagnostic returned when a tool call is rejected before execution.
 *  Mirrors the shape of buildInvalidEnumResult in error-diagnostics.ts so the
 *  run-turn loop can feed any rejection back to the model uniformly. */
export type ArgValidationResult = {
  error: true
  diagnosed: true
  pattern:
    | "invalid-tool-args"
    | "missing-required-field"
    | "guardrail-repeat"
  root_cause: string
  fix: string
  recoverable: true
  instruction_to_model: string
  /** Offending field paths, e.g. ["product.options"]. */
  fields?: string[]
}

export type ToolEntry = {
  name: string
  toolset: string
  description: string
  schema: JsonSchema
  risk: KamiToolRisk
  handler: (args: Record<string, unknown>, ctx: KamiCtx) => Promise<unknown>
  /** Optional domain validator for nested DTO requirements the loose JSON Schema
   *  cannot express (e.g. create_product must have a non-empty options array).
   *  Return null if valid; return a structured diagnostic if invalid. */
  validate?: (
    args: Record<string, unknown>
  ) => ArgValidationResult | null
}

const entries = new Map<string, ToolEntry>()

export const registerTool = (entry: ToolEntry) => {
  entries.set(entry.name, entry)
}

export const getTool = (name: string) => entries.get(name)

export const listTools = (toolset = "admin") => {
  return [...entries.values()].filter(
    (entry) => entry.toolset === "general" || entry.toolset === toolset
  )
}

export const toolDefinitions = (toolset = "admin"): ToolDefinition[] => {
  return listTools(toolset).map((entry) => ({
    type: "function",
    function: {
      name: entry.name,
      description: entry.description,
      parameters: entry.schema,
    },
  }))
}

export const resetToolsForTests = () => {
  entries.clear()
}
