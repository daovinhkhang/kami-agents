import Ajv, { type ErrorObject } from "ajv"
import type { ArgValidationResult, ToolEntry } from "./registry"

/**
 * Pre-execution argument validation for KAMI tools.
 *
 * Two layers:
 *  1. Structural — validate the tool call args against the registered JSON Schema
 *     (type / required / enum / items / nested properties / additionalProperties).
 *     ajv coerces tolerant type mismatches in place ("42" -> 42, "true" -> true).
 *  2. Domain — delegate to the tool's optional `validate` hook for nested DTO
 *     requirements the loose schema cannot express.
 *
 * On failure returns a structured diagnostic (never throws), mirroring
 * validateFilterEnums on the read path so run-turn can feed it back to the model.
 */

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  useDefaults: false,
  // sanitizeSchema strips `pattern` and flattens single-non-null `anyOf`; some
  // registered schemas may carry draft-07 keywords ajv's strict mode would flag.
  strict: false,
})

const compileCache = new Map<string, ReturnType<typeof ajv.compile>>()

const getValidator = (entry: ToolEntry) => {
  let fn = compileCache.get(entry.name)
  if (!fn) {
    fn = ajv.compile(entry.schema)
    compileCache.set(entry.name, fn)
  }
  return fn
}

/** Turn an ajv instancePath like "/product/options" into "product.options" (or "(root)"). */
const fieldPath = (err: ErrorObject): string => {
  const raw = err.instancePath.replace(/^\//, "").replace(/\//g, ".")
  if (raw) {
    return err.params && typeof err.params === "object" && "missingProperty" in err.params
      ? `${raw}.${(err.params as { missingProperty: string }).missingProperty}`
      : raw
  }
  if (err.params && typeof err.params === "object" && "missingProperty" in err.params) {
    return String((err.params as { missingProperty: string }).missingProperty)
  }
  return "(root)"
}

const formatSchemaErrors = (
  entry: ToolEntry,
  errors: ErrorObject[]
): ArgValidationResult => {
  const paths = errors.map(fieldPath)
  const detail = errors
    .slice(0, 6)
    .map((e) => `- ${fieldPath(e) || "(root)"}: ${e.message ?? "invalid"}`)
    .join("\n")

  return {
    error: true,
    diagnosed: true,
    pattern: "invalid-tool-args",
    root_cause:
      `Tool "${entry.name}" was called with arguments that fail JSON Schema validation. ` +
      `Offending fields: ${paths.join(", ")}. Details:\n${detail}`,
    fix:
      `Correct the fields listed above so they match the tool's schema. ` +
      `If a value is genuinely unknown, do NOT guess — call ask_user to get it from the user, ` +
      `or create_commerce_draft to stage the action for review.`,
    recoverable: true,
    fields: paths,
    instruction_to_model:
      `Your tool call "${entry.name}" was REJECTED before execution because the arguments were malformed. ` +
      `Read the field list above, fix each one, and retry. Do NOT repeat the same malformed call. ` +
      `If you are unsure of a required value, call ask_user instead of guessing.`,
  }
}

/**
 * Validate (and coerce) tool call arguments before the handler runs.
 * Returns null when valid; returns a structured diagnostic when invalid.
 * NOTE: ajv mutates `args` in place when coerceTypes applies a fix.
 */
export const validateToolArgs = (
  args: Record<string, unknown>,
  entry: ToolEntry
): ArgValidationResult | null => {
  const validator = getValidator(entry)

  const ok = validator(args)
  if (!ok) {
    return formatSchemaErrors(entry, (validator.errors ?? []) as ErrorObject[])
  }

  if (entry.validate) {
    const domainResult = entry.validate(args)
    if (domainResult) {
      return domainResult
    }
  }

  return null
}
