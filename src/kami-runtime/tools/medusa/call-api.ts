/**
 * call_api — unified Medusa admin API access via container internals.
 *
 * Maps HTTP-style method+path calls to KAMI's internal dispatch:
 *   GET          → ctx.scope.resolve(QUERY).graph()       (container, HTTP fallback)
 *   POST/DELETE  → ctx.executor.runWorkflow(wf, input)    (workflow)
 *   Unknown      → HTTP fallback with auto-generated JWT  (loopback)
 *
 * The catalog (from api-catalog.ts) provides the path→entity and path→workflow
 * mappings used by this handler.
 */

import { registerTool } from "../registry"
import { graph, graphById } from "./shared"
import { parseOpenApiPaths, extractPathIds } from "./api-catalog"
import type { KamiCtx } from "../../types"
import { ContainerRegistrationKeys, generateJwtToken } from "@medusajs/framework/utils"
import path from "node:path"

// ── Catalog (lazy loaded) ──

let _catalog: ReturnType<typeof parseOpenApiPaths> | null = null

function getCatalog() {
  if (!_catalog) {
    // Resolve the OpenAPI paths directory relative to the monorepo root
    const specDir = path.resolve(process.cwd(), "../www/apps/api-reference/specs/admin/paths")
    _catalog = parseOpenApiPaths(specDir)
  }
  return _catalog
}

// ── objectSchema helper ──

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})

// ── entityFromPath (exact same logic as catalog, but usable standalone) ──

const SPECIAL_ENTITIES: Record<string, string> = {
  "api-keys": "api_key",
  "customer-groups": "customer_group",
  "draft-orders": "draft_order",
  "product-categories": "product_category",
  "product-types": "product_type",
  "product-tags": "product_tag",
  "sales-channels": "sales_channel",
  "stock-locations": "stock_location",
  "tax-rates": "tax_rate",
  "tax-regions": "tax_region",
  "price-lists": "price_list",
  "shipping-options": "shipping_option",
  "shipping-profiles": "shipping_profile",
  "payment-collections": "payment_collection",
  "return-reasons": "return_reason",
  "refund-reasons": "refund_reason",
  "fulfillment-sets": "fulfillment_set",
  "fulfillment-providers": "fulfillment_provider",
  "inventory-items": "inventory_item",
  "reservations": "reservation",
  "service-zones": "service_zone",
  "order-edits": "order_edit",
  "property-labels": "property_label",
  "product-variants": "product_variant",
  "shipping-methods": "shipping_method",
}

function entityFromPath(urlPath: string): string {
  const segments = urlPath.replace(/^\/admin\//, "").split("/")
  const entitySegment = segments[0]
  if (SPECIAL_ENTITIES[entitySegment]) return SPECIAL_ENTITIES[entitySegment]
  if (entitySegment.endsWith("ies")) return entitySegment.slice(0, -3) + "y"
  if (entitySegment.endsWith("ses")) return entitySegment.slice(0, -2)
  if (entitySegment.endsWith("s") && !entitySegment.endsWith("ss")) return entitySegment.slice(0, -1)
  return entitySegment
}

// ── Path matching ──

/**
 * Find the catalog entry that best matches a concrete path like
 * "/admin/products/prod_123". Returns the endpoint pattern + extracted path params.
 */
function matchCatalogPath(
  concretePath: string,
  method: string
): { endpoint: import("./api-catalog").ApiEndpoint; pathIds: Record<string, string> } | null {
  const catalog = getCatalog()
  const normalizedConcrete = concretePath.replace(/\/$/, "") // strip trailing slash

  // First, try exact match (no path params)
  for (const ep of catalog.endpoints) {
    if (ep.method === method && ep.urlPath === normalizedConcrete) {
      return { endpoint: ep, pathIds: {} }
    }
  }

  // Then, try pattern match with path params
  for (const ep of catalog.endpoints) {
    if (ep.method !== method) continue
    if (!ep.urlPath.includes(":")) continue

    const ids = matchPattern(ep.urlPath, normalizedConcrete)
    if (ids) {
      return { endpoint: ep, pathIds: ids }
    }
  }

  return null
}

/**
 * Match a pattern like "/admin/products/:id" against "/admin/products/prod_123".
 * Returns the extracted path params, or null if no match.
 */
function matchPattern(pattern: string, concrete: string): Record<string, string> | null {
  const patternParts = pattern.split("/")
  const concreteParts = concrete.split("/")

  if (patternParts.length !== concreteParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = concreteParts[i]
    } else if (patternParts[i] !== concreteParts[i]) {
      return null
    }
  }

  return params
}

// ── HTTP fallback ──

async function httpFallback(
  method: string,
  apiPath: string,
  query: Record<string, unknown> | undefined,
  body: unknown,
  ctx: KamiCtx
): Promise<unknown> {
  try {
    const configModule = ctx.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as any
    const jwtSecret = configModule?.projectConfig?.http?.jwtSecret
    if (!jwtSecret) {
      return { error: "HTTP fallback requires JWT secret in Medusa config.", hint: "Set http.jwtSecret in medusa-config.ts." }
    }

    const tokenPayload = {
      actor_id: ctx.userId || "kami",
      actor_type: "user",
      auth_identity_id: ctx.userId || "kami",
    }
    const token = generateJwtToken(tokenPayload, { secret: jwtSecret, expiresIn: "5m" })

    // Loopback base is configurable: KAMI self-calls the same Medusa server it
    // runs inside, but the host/port vary by deployment (Docker, custom PORT).
    const baseUrl = (
      process.env.KAMI_SELF_BASE_URL ||
      process.env.MEDUSA_BACKEND_URL ||
      `http://localhost:${process.env.PORT || 9000}`
    ).replace(/\/$/, "")
    const url = new URL(`${baseUrl}${apiPath}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url.toString(), fetchOptions)
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch {
      return { status: response.status, raw: text.slice(0, 2000) }
    }
  } catch (err: any) {
    return { error: `HTTP fallback failed: ${err.message}`, hint: "The endpoint may not exist or the server is unreachable." }
  }
}

// ── Main handler ──

export const callApiHandler = async (args: Record<string, unknown>, ctx: KamiCtx) => {
  const method = String(args.method ?? "GET").toUpperCase()
  const apiPath = String(args.path ?? "").trim()
  const query = (args.query as Record<string, unknown> | undefined) ?? {}
  const body = args.body

  if (!apiPath) {
    return { error: "No path provided.", hint: "Provide a path like '/admin/products'." }
  }
  if (!["GET", "POST", "DELETE"].includes(method)) {
    return { error: `Unsupported method: ${method}.`, hint: "Use GET, POST, or DELETE." }
  }

  // ── Sandbox guard: only GET in execute_code ──
  if (method !== "GET" && (ctx as any)._sandboxRpc) {
    return {
      error: `call_api with method ${method} is not allowed in execute_code sandbox.`,
      hint: "Only GET (read) operations are available in execute_code. Use call_api directly (outside sandbox) for mutations.",
    }
  }

  // ── GET: use graph() via container ──
  if (method === "GET") {
    // Try to match the catalog to get the entity
    const match = matchCatalogPath(apiPath, "GET")
    if (!match) {
      return await httpFallback(method, apiPath, query as Record<string, unknown>, undefined, ctx)
    }

    const entity = match?.endpoint.entity || entityFromPath(apiPath)
    const pathIds = match?.pathIds || {}

    // Merge path IDs into filters
    const filters: Record<string, unknown> = { ...(query as Record<string, unknown>) }
    try {
      if (pathIds.id) {
        // Single entity lookup
        return await graphById(ctx, entity, pathIds.id)
      }

      // List query with filters
      const limit = query.limit !== undefined ? Math.min(Number(query.limit), 100) : undefined
      const offset = query.offset !== undefined ? Number(query.offset) : undefined

      return await graph(ctx, entity, {
        ...filters,
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      })
    } catch {
      return await httpFallback(method, apiPath, query as Record<string, unknown>, undefined, ctx)
    }
  }

  // ── POST/DELETE: use workflow or HTTP fallback ──
  const match = matchCatalogPath(apiPath, method)
  const workflowName = match?.endpoint.workflow
  const pathIds = match?.pathIds || {}

  if (workflowName) {
    try {
      // Dynamically import the workflow from @medusajs/core-flows
      const coreFlows = await import("@medusajs/core-flows")
      const workflow = (coreFlows as any)[workflowName]

      if (!workflow) {
        return {
          error: `Workflow "${workflowName}" not found in @medusajs/core-flows.`,
          hint: "The OpenAPI spec references this workflow but it may not be exported. Try using the dedicated tool instead.",
        }
      }

      // Build workflow input: merge path IDs into body, or use body directly
      let input = body ?? {}
      if (pathIds && Object.keys(pathIds).length > 0) {
        // For update-by-id style workflows, inject the ID
        if (typeof input === "object" && input !== null) {
          input = { ...input as Record<string, unknown>, ...pathIds }
        }
      }

      return await ctx.executor.runWorkflow(workflow, input)
    } catch (err: any) {
      // Check for common import errors
      if (err.code === "ERR_MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
        return {
          error: `Failed to import workflow "${workflowName}".`,
          hint: "This workflow may not be available in the current Medusa version. Use a dedicated tool or try HTTP fallback.",
          detail: err.message,
        }
      }
      return {
        error: `Workflow execution failed: ${err.message}`,
        hint: "Check the body format against the Medusa API documentation.",
        workflow: workflowName,
        detail: err.message,
      }
    }
  }

  // ── No workflow mapping: use HTTP fallback ──
  return await httpFallback(method, apiPath, query as Record<string, unknown>, body, ctx)
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export const registerCallApiTools = () => {
  registerTool({
    name: "call_api",
    toolset: "admin",
    description:
      "Call any Medusa Admin API endpoint using internal dispatch. " +
      "GET requests use the query graph first and HTTP fallback when needed (read risk). " +
      "POST/DELETE requests use core-flows workflows with superuser context (mutating/destructive risk). " +
      "Provide method (GET/POST/DELETE), path (e.g. '/admin/products'), optional query (for GET) and body (for POST). " +
      "In execute_code sandbox, only GET is allowed. " +
      "Use this when no dedicated KAMI tool exists for the endpoint you need. " +
      "Prefer dedicated tools (list_products, create_product, etc.) for common operations — they have better validation.",
    // Static fallback only. The real risk is computed per-call by
    // resolveEffectiveRisk in the dispatcher (GET=read, POST=mutating,
    // DELETE=destructive) — that is what the approval gate, the tool_start
    // badge, and the per-turn mutation limit all reason about.
    risk: "read",
    schema: objectSchema(
      {
        method: {
          type: "string",
          enum: ["GET", "POST", "DELETE"],
          description: "HTTP method. GET reads data, POST creates/updates, DELETE removes.",
        },
        path: {
          type: "string",
          description: "Admin API path, e.g. '/admin/products' or '/admin/products/prod_123'.",
        },
        query: {
          type: "object",
          description: "Query parameters for GET requests (filters, limit, offset, fields).",
        },
        body: {
          type: "object",
          description: "Request body for POST requests.",
        },
      },
      ["method", "path"]
    ),
    handler: callApiHandler,
  })
}
