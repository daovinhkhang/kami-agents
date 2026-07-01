/**
 * API Catalog — parses OpenAPI path YAML files and generates:
 *   1. A compact text reference for the LLM prompt
 *   2. A workflow-name → export-name mapping for call_api dispatch
 */

import fs from "node:fs"
import path from "node:path"

// ── Types ──

export type ApiEndpoint = {
  method: "GET" | "POST" | "DELETE"
  urlPath: string          // "/admin/products" or "/admin/products/:id"
  entity: string           // "product"
  operationId: string
  summary: string
  queryParams: { name: string; type: string; description: string }[]
  pathParams: { name: string; description: string }[]
  workflow?: string        // "createProductsWorkflow" etc.
  hasBody: boolean
  tag: string              // "Products", "Orders", etc.
}

/** Map from "METHOD /admin/path" → workflow export name */
export type WorkflowMap = Map<string, string>

/** All endpoints grouped by tag for prompt generation */
export type ApiCatalog = {
  endpoints: ApiEndpoint[]
  byTag: Map<string, ApiEndpoint[]>
  workflowMap: WorkflowMap
  promptText: string
}

// ── Path → entity mapping helpers ──

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
}

function entityFromPath(urlPath: string): string {
  // Strip /admin/ prefix and any sub-paths
  const segments = urlPath.replace(/^\/admin\//, "").split("/")
  const entitySegment = segments[0]  // e.g. "products", "customer-groups"

  if (SPECIAL_ENTITIES[entitySegment]) return SPECIAL_ENTITIES[entitySegment]

  // Default: singularize by stripping trailing 's'
  if (entitySegment.endsWith("ies")) return entitySegment.slice(0, -3) + "y"
  if (entitySegment.endsWith("ses")) return entitySegment.slice(0, -2)  // addresses → address, taxes → tax
  if (entitySegment.endsWith("s") && !entitySegment.endsWith("ss")) return entitySegment.slice(0, -1)
  return entitySegment
}

/** Extract :id values from a concrete path */
export function extractPathIds(urlPath: string, pattern: string): Record<string, string> {
  const pathParts = urlPath.replace(/^\/admin\//, "").split("/")
  const patternParts = pattern.replace(/^\/admin\//, "").split("/")
  const ids: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      const name = patternParts[i].slice(1)
      ids[name] = pathParts[i] || ""
    }
  }
  return ids
}

// ── Simple YAML parser (only what we need for OpenAPI path files) ──

/**
 * Minimal YAML line parser that handles the structure of OpenAPI path files:
 *   get:
 *     operationId: GetProducts
 *     summary: List Products
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: number
 *     x-workflow: createProductsWorkflow
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: ...
 *     tags:
 *       - Products
 */
function parseSimpleYaml(content: string): Record<string, any> {
  const lines = content.split("\n")
  const root: Record<string, any> = {}

  let currentMethod: string | null = null
  let currentMethodObj: Record<string, any> = {}
  let inParams = false
  let currentParam: Record<string, any> | null = null
  let inSchema = false
  let inRequestBody = false
  let currentTags: string[] = []
  let indentLevel = 0

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue

    const indent = line.search(/\S/)
    const trimmed = line.trim()

    // Top-level method (get:, post:, delete:)
    if (indent === 0 && /^(get|post|delete):$/i.test(trimmed)) {
      if (currentMethod && currentMethodObj) {
        finalizeMethod(root, currentMethod, currentMethodObj, currentTags, currentParam)
      }
      currentMethod = trimmed.replace(/:$/, "").toUpperCase()
      currentMethodObj = {}
      inParams = false
      inRequestBody = false
      inSchema = false
      currentParam = null
      currentTags = []
      indentLevel = 0
      continue
    }

    if (!currentMethod) continue

    // Track indent level
    const keyMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_*-]*):\s*(.*)/)
    if (keyMatch) {
      const key = keyMatch[1]
      const value = keyMatch[2]

      // parameters: — start array of params
      if (key === "parameters" && indent === 2) {
        inParams = true
        inSchema = false
        inRequestBody = false
        currentParam = null
        continue
      }

      // requestBody: — mark that we're in request body section
      if (key === "requestBody" && indent === 2) {
        inRequestBody = true
        inParams = false
        inSchema = false
        currentParam = null
        continue
      }

      // x-workflow: — extract workflow name
      if (key === "x-workflow" && indent === 2) {
        currentMethodObj.workflow = value.trim()
        continue
      }

      // tags section
      if (key === "tags" && indent === 2) {
        currentTags = []
        continue
      }

      // Inside parameters list: "- name: limit"
      if (inParams && key === "name" && indent === 4) {
        // Start new param
        if (currentParam) {
          if (!currentMethodObj.queryParams) currentMethodObj.queryParams = []
          if (!currentMethodObj.pathParams) currentMethodObj.pathParams = []
          if (currentParam.in === "query") currentMethodObj.queryParams.push(currentParam)
          else if (currentParam.in === "path") currentMethodObj.pathParams.push(currentParam)
        }
        currentParam = { name: value.trim(), type: "string", description: "", in: "query" }
        inSchema = false
        continue
      }

      // in: query | path
      if (inParams && key === "in" && indent === 6 && currentParam) {
        currentParam.in = value.trim()
        continue
      }

      // schema: — entering schema block
      if (key === "schema" && indent === 6 && currentParam) {
        inSchema = true
        continue
      }

      // description: (at param level)
      if (key === "description" && indent === 6 && currentParam && !inSchema) {
        currentParam.description = value.trim()
        continue
      }

      // type: (inside schema)
      if (inSchema && key === "type" && indent >= 8 && currentParam) {
        currentParam.type = value.trim()
        inSchema = false
        continue
      }

      // Method-level keys
      if (indent === 2) {
        inParams = false
        inSchema = false
        inRequestBody = false
        // Save old param
        if (currentParam) {
          if (!currentMethodObj.queryParams) currentMethodObj.queryParams = []
          if (!currentMethodObj.pathParams) currentMethodObj.pathParams = []
          if (currentParam.in === "query") currentMethodObj.queryParams.push(currentParam)
          else if (currentParam.in === "path") currentMethodObj.pathParams.push(currentParam)
          currentParam = null
        }

        if (key === "operationId") currentMethodObj.operationId = value.trim()
        else if (key === "summary") currentMethodObj.summary = value.trim()
        else if (key === "description") currentMethodObj.description = value.trim()
        else if (key === "x-workflow") currentMethodObj.workflow = value.trim()
        continue
      }
    }

    // Tag list items: "  - Products"
    const tagMatch = trimmed.match(/^-\s+(.+)/)
    if (tagMatch && indent === 4 && currentTags !== undefined && !inParams && !inRequestBody) {
      currentTags.push(tagMatch[1].trim())
      continue
    }
  }

  // Finalize last method
  if (currentMethod && currentMethodObj) {
    finalizeMethod(root, currentMethod, currentMethodObj, currentTags, currentParam)
  }

  return root
}

function finalizeMethod(
  root: Record<string, any>,
  method: string,
  obj: Record<string, any>,
  tags: string[],
  lastParam: Record<string, any> | null,
) {
  if (lastParam) {
    if (!obj.queryParams) obj.queryParams = []
    if (!obj.pathParams) obj.pathParams = []
    if (lastParam.in === "query") obj.queryParams.push(lastParam)
    else if (lastParam.in === "path") obj.pathParams.push(lastParam)
  }
  obj.tags = tags
  obj.hasBody = obj._hasBody || false
  root[method] = obj
}

// ── Filename → URL path conversion ──

function filenameToPath(filename: string): string {
  // "admin_products.yaml" → "/admin/products"
  // "admin_products_{id}.yaml" → "/admin/products/:id"
  // "admin_products_{id}_variants_{variant_id}_inventory-items.yaml" → "/admin/products/:id/variants/:variant_id/inventory-items"
  // "admin_claims_{id}_claim-items_{action_id}.yaml" → "/admin/claims/:id/claim-items/:action_id"
  const name = filename.replace(/\.yaml$/, "")

  // Tokenize: split on _ but keep {foo_bar} params intact
  // Strategy: replace each {param} with a non-underscore placeholder, split, then restore
  const params: string[] = []
  let paramIdx = 0
  const withPlaceholders = name.replace(/\{([^}]+)\}/g, (_match, content) => {
    params.push(content)
    return `\x00PARAM${paramIdx++}\x00`
  })

  const segments = withPlaceholders.split("_")
  const result: string[] = []

  for (const seg of segments) {
    if (seg === "admin") {
      result.push("/admin")
      continue
    }

    // Restore placeholders
    const restored = seg.replace(/\x00PARAM(\d+)\x00/g, (_m, idx) => ":" + params[parseInt(idx)])
    result.push(restored)
  }

  return result.join("/")
}

// ── Main parser ──

export function parseOpenApiPaths(openApiDir: string): ApiCatalog {
  const endpoints: ApiEndpoint[] = []
  const byTag = new Map<string, ApiEndpoint[]>()
  const workflowMap: WorkflowMap = new Map()

  if (!fs.existsSync(openApiDir)) {
    return { endpoints, byTag, workflowMap, promptText: "" }
  }

  const files = fs.readdirSync(openApiDir).filter(f => f.endsWith(".yaml") && f.startsWith("admin_"))

  for (const file of files) {
    const content = fs.readFileSync(path.join(openApiDir, file), "utf-8")
    const parsed = parseSimpleYaml(content)
    const urlPath = filenameToPath(file)

    for (const [method, obj] of Object.entries(parsed)) {
      if (!["GET", "POST", "DELETE"].includes(method)) continue
      const m = obj as Record<string, any>

      const tag = (m.tags?.[0] as string) || "Other"
      // Normalize tag: "Product Types" → "Product Types", use as-is
      const normalizedTag = tag

      const endpoint: ApiEndpoint = {
        method: method as "GET" | "POST" | "DELETE",
        urlPath,
        entity: entityFromPath(urlPath),
        operationId: (m.operationId as string) || "",
        summary: (m.summary as string) || (m.description as string)?.split(".")[0] || "",
        queryParams: (m.queryParams as any[]) || [],
        pathParams: (m.pathParams as any[]) || [],
        workflow: m.workflow as string | undefined,
        hasBody: !!m.hasBody || (method === "POST" && file.includes("_{id}")),
        tag: normalizedTag,
      }

      endpoints.push(endpoint)

      if (!byTag.has(normalizedTag)) byTag.set(normalizedTag, [])
      byTag.get(normalizedTag)!.push(endpoint)

      // Build workflow map key: "POST /admin/products"
      if (endpoint.workflow) {
        workflowMap.set(`${method} ${urlPath}`, endpoint.workflow)
      }
    }
  }

  // Sort endpoints within each tag: GET first, then POST, then DELETE
  for (const [, list] of byTag) {
    list.sort((a, b) => {
      const methodOrder = (m: string) => m === "GET" ? 0 : m === "POST" ? 1 : 2
      return methodOrder(a.method) - methodOrder(b.method) || a.urlPath.localeCompare(b.urlPath)
    })
  }

  const promptText = buildCatalogPrompt(byTag)

  return { endpoints, byTag, workflowMap, promptText }
}

// ── Prompt generation ──

function buildCatalogPrompt(byTag: Map<string, ApiEndpoint[]>): string {
  // Build a compact summary suitable for injection into the LLM prompt.
  // Only includes method, path, summary, and workflow annotation.
  // Detailed parameter info is available via the api_catalog tool when needed.
  const lines: string[] = [
    "## Medusa Admin API Catalog Summary",
    `${byTag.size} resource groups. For full details including query params, use the api_catalog tool.`,
    "",
  ]

  // Sort tags alphabetically
  const sortedTags = [...byTag.keys()].sort()

  for (const tag of sortedTags) {
    const endpoints = byTag.get(tag)!
    if (endpoints.length === 0) continue

    lines.push(`### ${tag}`)

    // Group: show list endpoints compactly
    for (const ep of endpoints) {
      const methodPad = ep.method === "GET" ? "GET   " : ep.method === "POST" ? "POST  " : "DELETE"
      const pathDisplay = ep.urlPath.replace(/:(\w+)/g, "{$1}")
      const wfTag = ep.workflow ? `  # ${ep.workflow}` : ""
      lines.push(`  ${methodPad} ${pathDisplay}  — ${ep.summary}${wfTag}`)
    }

    lines.push("")
  }

  return lines.join("\n")
}

// ── Runtime helpers ──

/** Format query params as a compact string for tool descriptions */
export function compactQueryParams(params: { name: string; type: string; description: string }[]): string {
  return params
    .filter(p => !["fields", "offset", "limit", "order"].includes(p.name))
    .map(p => `${p.name}: ${p.type}`)
    .join(", ")
}
