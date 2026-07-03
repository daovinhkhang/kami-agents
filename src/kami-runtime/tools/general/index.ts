import { sanitizeSchema } from "../schema-sanitizer"
import { registerTool } from "../registry"
import { createPostgresMemoryProvider } from "../../memory/postgres"
import { createEmbeddingMemoryProvider } from "../../memory/embedding"
import { createDialecticMemoryProvider } from "../../memory/dialectic"
import { DockerSandbox } from "../../sandbox/docker-sandbox"
import { KamiRpcExecutor } from "../../sandbox/rpc-executor"
import { parseSchedule } from "../../cron/schedule-parser"
import { spawnSubagent } from "../../subagents/spawn"
import { artifactToCsv } from "../../report/export"
import { runKamiEvaluationHarness } from "../../evals/harness"
import { buildAutonomySnapshot, evaluateAutonomy } from "../../security/autonomy"
import { getTool } from "../registry"
import type { KamiCommerceDraft, KamiToolRisk, KamiUiCommand } from "../../types"

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
) =>
  sanitizeSchema({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  })

const includes = (value: unknown, query: string) => {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase())
}

const asRisk = (value: unknown): KamiToolRisk => {
  if (value === "read" || value === "safe" || value === "mutating" || value === "destructive") {
    return value
  }

  return "mutating"
}

const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export const registerGeneralTools = () => {
  registerTool({
    name: "finish",
    toolset: "general",
    description: "Finish the current turn with a final answer.",
    risk: "safe",
    schema: objectSchema(
      {
        answer: { type: "string" },
      },
      ["answer"]
    ),
    handler: async (args) => args.answer ?? "",
  })

  registerTool({
    name: "memory_add",
    toolset: "general",
    description: "Store a long-term memory for KAMI.",
    risk: "safe",
    schema: objectSchema(
      {
        content: { type: "string" },
        type: {
          type: "string",
          enum: ["factual", "preference", "goal", "instruction", "event"],
        },
        importance: { type: "number" },
        user_id: { type: "string" },
        session_id: { type: "string" },
      },
      ["content"]
    ),
    handler: async (args, ctx) => {
      return await createPostgresMemoryProvider(ctx).add({
        content: String(args.content),
        type: args.type as any,
        importance: Number(args.importance ?? 1),
        user_id: args.user_id as string | undefined,
        session_id: args.session_id as string | undefined,
      })
    },
  })

  registerTool({
    name: "memory_search",
    toolset: "general",
    description: "Search KAMI long-term memories by text.",
    risk: "read",
    schema: objectSchema(
      {
        query: { type: "string" },
        limit: { type: "number" },
      },
      ["query"]
    ),
    handler: async (args, ctx) => {
      return await createPostgresMemoryProvider(ctx).search({
        query: String(args.query),
        limit: Number(args.limit ?? 10),
      })
    },
  })

  registerTool({
    name: "memory_recall",
    toolset: "general",
    description: "Recall recent KAMI memories for the current user/session.",
    risk: "read",
    schema: objectSchema({
      limit: { type: "number" },
    }),
    handler: async (args, ctx) => {
      return await createPostgresMemoryProvider(ctx).recall(
        Number(args.limit ?? 10)
      )
    },
  })

  registerTool({
    name: "skill_view",
    toolset: "general",
    description: "List skills or view a skill by name.",
    risk: "read",
    schema: objectSchema({
      name: { type: "string" },
      limit: { type: "number" },
    }),
    handler: async (args, ctx) => {
      if (args.name) {
        const skills = await ctx.kami.listKamiSkills({
          name: String(args.name),
        })

        return skills[0] ?? null
      }

      return await ctx.kami.listKamiSkills(
        { disabled: false },
        {
          take: Number(args.limit ?? 20),
          order: { name: "ASC" },
        }
      )
    },
  })

  registerTool({
    name: "skill_manage",
    toolset: "general",
    description: "Create or update a KAMI skill.",
    risk: "mutating",
    schema: objectSchema(
      {
        name: { type: "string" },
        description: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        version: { type: "string" },
        disabled: { type: "boolean" },
      },
      ["name", "content"]
    ),
    handler: async (args, ctx) => {
      const existing = await ctx.kami.listKamiSkills({
        name: String(args.name),
      })

      if (existing[0]) {
        return await ctx.kami.updateKamiSkills({
          id: existing[0].id,
          description: (args.description as string | null) ?? existing[0].description,
          content: String(args.content),
          category: (args.category as string | null) ?? existing[0].category,
          version: (args.version as string) ?? existing[0].version,
          disabled: (args.disabled as boolean) ?? existing[0].disabled,
          origin: "agent",
        })
      }

      const [skill] = await ctx.kami.createKamiSkills([
        {
          name: String(args.name),
          description: (args.description as string | null) ?? null,
          content: String(args.content),
          category: (args.category as string | null) ?? null,
          version: (args.version as string) ?? "0.1.0",
          origin: "agent",
          disabled: (args.disabled as boolean) ?? false,
        },
      ])

      return skill
    },
  })

  registerTool({
    name: "session_search",
    toolset: "general",
    description: "Search KAMI chat messages by text.",
    risk: "read",
    schema: objectSchema(
      {
        query: { type: "string" },
        limit: { type: "number" },
      },
      ["query"]
    ),
    handler: async (args, ctx) => {
      const messages = await ctx.kami.listKamiMessages(
        {},
        { take: 500, order: { created_at: "DESC" } }
      )
      const limit = Number(args.limit ?? 20)

      return messages
        .filter((message: any) => includes(message.content, String(args.query)))
        .slice(0, limit)
    },
  })

  registerTool({
    name: "create_artifact",
    toolset: "general",
    description:
      "Persist a structured KAMI artifact for reports, tables, charts, exports, or KPI summaries. Use this when a user asks for a business report, analytics, sales summary, inventory report, customer report, or exportable table.",
    risk: "safe",
    schema: objectSchema(
      {
        type: {
          type: "string",
          enum: ["report", "table", "chart", "export", "kpi"],
        },
        title: { type: "string" },
        payload: { type: "object" },
        metadata: { type: "object" },
      },
      ["type", "title", "payload"]
    ),
    handler: async (args, ctx) => {
      const [artifact] = await ctx.kami.createKamiArtifacts([
        {
          session_id: ctx.sessionId,
          type: String(args.type ?? "report"),
          title: String(args.title ?? "KAMI Artifact"),
          schema_version: "1.0",
          payload: args.payload as Record<string, unknown>,
          metadata: (args.metadata ?? null) as Record<string, unknown> | null,
        },
      ] as Parameters<typeof ctx.kami.createKamiArtifacts>[0])

      return artifact
    },
  })

  registerTool({
    name: "ui_command",
    toolset: "general",
    description:
      "Send a structured UI command to the KAMI cockpit. Use this to open or focus report/draft cards, the admin drawer, commerce records, highlighted issues, or user confirmations. This only controls the interface; it does not mutate commerce data. Do not describe UI targets as a right panel or side panel.",
    risk: "safe",
    schema: objectSchema(
      {
        action: {
          type: "string",
          enum: [
            "open_panel",
            "open_artifact",
            "open_drawer",
            "open_draft",
            "focus_record",
            "highlight_issue",
            "request_confirmation",
          ],
        },
        panel: {
          type: "string",
          enum: ["report", "draft", "record", "debug", "approvals", "memory", "cron", "settings", "autonomy", "evals"],
        },
        tab: { type: "string" },
        artifact_id: { type: "string" },
        draft_id: { type: "string" },
        record_type: {
          type: "string",
          enum: ["order", "product", "customer", "inventory", "promotion", "region", "other"],
        },
        record_id: { type: "string" },
        title: { type: "string" },
        reason: { type: "string" },
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
        },
        metadata: { type: "object" },
      },
      ["action"]
    ),
    handler: async (args) => {
      const command: KamiUiCommand = {
        action: args.action as KamiUiCommand["action"],
        panel: args.panel as KamiUiCommand["panel"] | undefined,
        tab: args.tab as string | undefined,
        artifact_id: args.artifact_id as string | undefined,
        draft_id: args.draft_id as string | undefined,
        record_type: args.record_type as KamiUiCommand["record_type"] | undefined,
        record_id: args.record_id as string | undefined,
        title: args.title as string | undefined,
        reason: args.reason as string | undefined,
        severity: args.severity as KamiUiCommand["severity"] | undefined,
        metadata: asRecord(args.metadata),
      }

      return command
    },
  })

  registerTool({
    name: "ask_user",
    toolset: "general",
    description:
      "Ask the user a clarifying question when a required value is unknown or ambiguous. " +
      "Use this INSTEAD OF guessing a value for a mutating tool (create/update product, order, " +
      "customer, inventory, promotion). The question and optional choices are surfaced to the user; " +
      "stop and wait for the answer rather than fabricating a value.",
    risk: "safe",
    schema: objectSchema(
      {
        question: {
          type: "string",
          description: "The clarifying question to ask the user.",
        },
        choices: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of choices for the user to pick from.",
        },
        context: {
          type: "string",
          description:
            "Brief explanation of why you need this (what action you were about to take).",
        },
      },
      ["question"]
    ),
    handler: async (args) => {
      return {
        question: String(args.question),
        choices: Array.isArray(args.choices) ? args.choices.map(String) : undefined,
        context: args.context ? String(args.context) : undefined,
        ui_command: {
          action: "request_confirmation",
          title: String(args.question),
          reason: args.context ? String(args.context) : undefined,
        } satisfies KamiUiCommand,
      }
    },
  })

  registerTool({
    name: "create_commerce_draft",
    toolset: "general",
    description:
      "Create a draft-first commerce action for the user to review in an inline draft card before execution. Use this before mutating products, orders, customers, promotions, inventory, shipping setup, schedules, or report templates unless the user explicitly asks for immediate execution. The draft stores target_tool and args; the UI will let the user edit and execute the real tool. Do not tell the user to use a right panel or side panel.",
    risk: "safe",
    schema: objectSchema(
      {
        draft_type: {
          type: "string",
          enum: [
            "product",
            "order",
            "promotion",
            "customer",
            "campaign",
            "inventory_adjustment",
            "shipping_fix",
            "schedule",
            "report_template",
            "custom",
          ],
        },
        title: { type: "string" },
        description: { type: "string" },
        target_tool: { type: "string" },
        args: { type: "object" },
        risk: {
          type: "string",
          enum: ["read", "safe", "mutating", "destructive"],
        },
        confirm_required: { type: "boolean" },
        metadata: { type: "object" },
      },
      ["draft_type", "title", "target_tool", "args"]
    ),
    handler: async (args, ctx) => {
      const now = new Date().toISOString()
      const risk = asRisk(args.risk)
      const draft: KamiCommerceDraft = {
        version: "1.0",
        draft_type: args.draft_type as KamiCommerceDraft["draft_type"],
        title: String(args.title),
        description: args.description ? String(args.description) : undefined,
        status: "pending",
        target_tool: String(args.target_tool),
        args: asRecord(args.args),
        risk,
        confirm_required: typeof args.confirm_required === "boolean"
          ? args.confirm_required
          : risk === "mutating" || risk === "destructive",
        created_at: now,
        updated_at: now,
        timezone: "Asia/Ho_Chi_Minh",
        utc_offset: "UTC+7",
        metadata: asRecord(args.metadata),
      }

      const [artifact] = await ctx.kami.createKamiArtifacts([
        {
          session_id: ctx.sessionId,
          type: "draft",
          title: draft.title,
          schema_version: draft.version,
          payload: draft,
          metadata: {
            status: draft.status,
            draft_type: draft.draft_type,
            target_tool: draft.target_tool,
            risk: draft.risk,
            confirm_required: draft.confirm_required,
            ...(draft.metadata ?? {}),
          },
        },
      ])

      return {
        draft_id: artifact.id,
        artifact,
        draft,
        ui_command: {
          action: "open_draft",
          panel: "draft",
          draft_id: artifact.id,
          title: draft.title,
          reason: "Draft created for review before execution.",
        } satisfies KamiUiCommand,
      }
    },
  })

  registerTool({
    name: "export_artifact_csv",
    toolset: "general",
    description:
      "Export a KAMI report artifact as CSV text. Use this when the user wants to download or export report tables.",
    risk: "read",
    schema: objectSchema(
      {
        artifact_id: { type: "string" },
      },
      ["artifact_id"]
    ),
    handler: async (args, ctx) => {
      const artifact = await ctx.kami.retrieveKamiArtifact(String(args.artifact_id))
      const csv = artifactToCsv(
        artifact.payload as unknown as Parameters<typeof artifactToCsv>[0]
      )

      return {
        artifact_id: artifact.id,
        title: artifact.title,
        filename: `${String(artifact.title ?? "kami-report").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
        content_type: "text/csv",
        content: csv,
      }
    },
  })

  registerTool({
    name: "schedule_task",
    toolset: "general",
    description:
      "Schedule a recurring task for KAMI to run on a cron schedule. Use natural language for the schedule (e.g. 'every morning at 9am', 'every monday at 8am', 'every 30 minutes'). The task will run headless and write results to the audit log.",
    risk: "mutating",
    schema: objectSchema(
      {
        name: { type: "string", description: "Short label for the scheduled job." },
        prompt: {
          type: "string",
          description:
            "Exact instruction KAMI should execute each time the job runs — treated as the user message for the headless turn.",
        },
        schedule_description: {
          type: "string",
          description:
            "When to run, in natural language. Examples: 'every morning at 9am', 'every weekday at 5pm', 'every 30 minutes', 'every monday at 8am'.",
        },
        deliver: {
          type: "string",
          enum: ["audit", "session"],
          description:
            "How to deliver results. 'audit' logs to the audit trail (default). 'session' stores results in a persistent session for admin review.",
        },
      },
      ["name", "prompt", "schedule_description"]
    ),
    handler: async (args, ctx) => {
      const scheduleDescription = String(args.schedule_description)
      const parsed = parseSchedule(scheduleDescription)
      const deliver = (args.deliver as string) ?? "audit"

      // For cron-tick compatibility the schedule field stores the cron expression.
      // The existing parseInterval() helper in cron-tick handles 5-field cron,
      // @hourly / @daily, and `every N *` all in one place.
      const [job] = await ctx.kami.createKamiJobs([
        {
          name: String(args.name),
          prompt: String(args.prompt),
          schedule: parsed.cron,
          deliver,
          session_id: deliver === "session" ? ctx.sessionId : null,
          enabled: true,
          next_run_at: null, // cron-tick will schedule it
        } as Record<string, unknown>,
      ])

      return {
        id: job.id,
        name: job.name,
        schedule: parsed.cron,
        schedule_label: parsed.label,
        deliver: job.deliver,
        enabled: job.enabled,
        note: parsed.recognized
          ? undefined
          : `Schedule "${scheduleDescription}" was not recognized — passed through as-is. If the cron tick does not support it, edit the job manually.`,
      }
    },
  })

  registerTool({
    name: "web_search",
    toolset: "general",
    description:
      "Search the web using DuckDuckGo and return the top results (title, snippet, URL). Useful for looking up facts that are not in KAMI's training data. No API key needed.",
    risk: "read",
    schema: objectSchema(
      {
        query: {
          type: "string",
          description: "Search query. Keep it concise and specific.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default 5, max 10).",
        },
      },
      ["query"]
    ),
    handler: async (args) => {
      const query = String(args.query)
      const maxResults = Math.min(
        Math.max(1, Number(args.max_results ?? 5)),
        10
      )
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

      let html: string

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "KAMI/0.1 (commerce agent)",
          },
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          return {
            query,
            results: [],
            error: `Search returned status ${response.status}. Try rephrasing the query.`,
          }
        }

        html = await response.text()
      } catch (networkError) {
        return {
          query,
          results: [],
          error:
            networkError instanceof Error
              ? `Search failed: ${networkError.message}`
              : "Search failed: network error",
        }
      }

      // DuckDuckGo's HTML endpoint groups each hit in a <div class="result...">
      // block containing an <a class="result__a"> title/link and an optional
      // <a|td class="result__snippet"> snippet. Parsing per-block keeps the
      // title, url, and snippet aligned even when some hits lack a snippet —
      // index-pairing across two flat lists silently mismatches them. The
      // regexes tolerate attribute reordering and single/double quotes because
      // DDG tweaks its markup periodically; if the block split ever fails we
      // fall back to scanning the whole document for links.
      const decodeEntities = (s: string): string =>
        s
          .replace(/&amp;/g, "&")
          .replace(/&#x27;|&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")

      const stripTags = (s: string): string =>
        s.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim()

      const cleanUrl = (raw: string): string => {
        const unescaped = decodeEntities(raw).replace(
          /^(?:https?:)?\/\/(?:[a-z]+\.)?duckduckgo\.com\/l\/\?(?:.*&)?uddg=/i,
          ""
        )
        // The uddg param is URL-encoded; strip any trailing &rut=… tracker.
        const encoded = unescaped.split("&")[0]
        try {
          return decodeURIComponent(encoded)
        } catch {
          return encoded
        }
      }

      const linkRegex =
        /<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
      const snippetRegex =
        /class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/i

      const results: { title: string; url: string; snippet: string }[] = []

      // Split into per-result blocks so each snippet stays with its own link.
      const blocks = html.split(/<(?:div|tr)\b[^>]*class=["'][^"']*\bresult\b/i)
      const source = blocks.length > 1 ? blocks.slice(1) : [html]

      for (const block of source) {
        if (results.length >= maxResults) break

        linkRegex.lastIndex = 0
        const linkMatch = linkRegex.exec(block)
        if (!linkMatch) continue

        const url = cleanUrl(linkMatch[1])
        const title = decodeEntities(stripTags(linkMatch[2]))
        if (!title || !/^https?:\/\//i.test(url)) continue

        const snippetMatch = snippetRegex.exec(block)
        const snippet = snippetMatch
          ? decodeEntities(stripTags(snippetMatch[1]))
          : ""

        results.push({ title, url, snippet })
      }

      if (results.length === 0) {
        return {
          query,
          results: [],
          count: 0,
          note: "No results parsed. DuckDuckGo may have changed its markup or rate-limited the request — try web_extract on a specific URL instead.",
        }
      }

      return { query, results, count: results.length }
    },
  })

  registerTool({
    name: "delegate_task",
    toolset: "general",
    description:
      "Spawn a subagent to handle a task independently in its own session. Use this for multi-step sub-tasks that can run in parallel or that need a different toolset. Each subagent runs its own KAMI loop and returns a structured result. Subagents are cheaper: they use a lighter model by default.",
    risk: "safe",
    schema: objectSchema(
      {
        task: {
          type: "string",
          description:
            "Complete instruction for the subagent — treated as its first user message. Include all context the subagent needs because it starts with a fresh session. Be specific about what tools to use and what format to return.",
        },
        toolset: {
          type: "string",
          description:
            "Restrict subagent tools. Options: 'admin' (all commerce+general), 'readonly' (read tools only), 'general' (non-commerce tools). Default: same as caller.",
        },
        model: {
          type: "string",
          description:
            "Model override for the subagent. Default: 'deepseek-chat' (cheaper, faster). Use the primary model only for complex reasoning.",
        },
      },
      ["task"]
    ),
    handler: async (args, ctx) => {
      const result = await spawnSubagent(
        {
          task: String(args.task),
          toolset: args.toolset as string | undefined,
          model: (args.model as string) ?? "deepseek-chat",
          maxIterations: 8,
        },
        {
          scope: ctx.scope,
          kami: ctx.kami,
          userId: ctx.userId,
          config: ctx.config,
        }
      )

      return {
        status: result.done ? "completed" : "failed",
        text: result.text,
        session_id: result.sessionId,
        tool_calls: result.toolCalls,
        tool_call_count: result.toolCalls.length,
        error: result.error ?? null,
      }
    },
  })

  // ---- Phase 5: execute_code (hermes-style RPC sandbox) ----
  registerTool({
    name: "execute_code",
    toolset: "general",
    description:
      "Execute JavaScript code with access to KAMI tools. " +
      "Import tools with `const { list_products, get_product, graph, ... } = require('./kami_tools')`. " +
      "Use when you need 3+ tool calls with processing logic, need to filter/reduce large tool outputs, " +
      "or need conditional branching/looping. Only read & safe tools are available. " +
      "Write your final result to stdout with console.log(). " +
      "Also available: json_parse(), retry(fn, maxAttempts, delay), sleep(ms). " +
      "Limits: 60s timeout, 30 tool calls max, 50KB stdout. " +
      "Use normal tool calls instead for single calls or when you need mutation tools.",
    risk: "safe",
    schema: objectSchema(
      {
        code: {
          type: "string",
          description:
            "JavaScript code. Use `const { toolName } = require('./kami_tools')` to call KAMI tools. Print final result to stdout.",
        },
      },
      ["code"]
    ),
    handler: async (args, ctx) => {
      const code = String(args.code).trim()
      if (!code) return { error: "No code provided.", hint: "Provide code to execute." }

      const result = await KamiRpcExecutor.execute(code, ctx)

      return {
        output: result.output,
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        timed_out: result.timedOut,
        tool_calls_made: result.toolCallsMade,
        tool_call_log: result.toolCallLog,
      }
    },
  })

  // ---- code_exec (Docker sandbox for Python/Bash — no RPC) ----
  registerTool({
    name: "code_exec",
    toolset: "general",
    description:
      "Execute Python or Bash code in an isolated Docker sandbox. No tool access, no network, read-only rootfs. Results include stdout, stderr, exit code, and timing. Requires KAMI_SANDBOX_ENABLED=true and Docker running.",
    risk: "safe",
    schema: objectSchema(
      {
        language: {
          type: "string",
          enum: ["python", "python3", "bash", "sh"],
          description: "Programming language runtime.",
        },
        code: {
          type: "string",
          description: "Source code to execute. Keep it focused — the sandbox has a 30s timeout.",
        },
      },
      ["language", "code"]
    ),
    handler: async (args) => {
      const sandboxEnabled =
        process.env.KAMI_SANDBOX_ENABLED === "true"
      if (!sandboxEnabled) {
        return {
          error:
            "code_exec is disabled. Set KAMI_SANDBOX_ENABLED=true and ensure Docker is running.",
          hint: "Ask the admin to enable the sandbox in .env configuration.",
        }
      }

      const sandbox = new DockerSandbox({
        image: process.env.KAMI_SANDBOX_IMAGE || "alpine:3.20",
        networkDisabled: process.env.KAMI_SANDBOX_NETWORK !== "true",
        readOnlyRootfs: process.env.KAMI_SANDBOX_READONLY !== "false",
      })

      const healthy = await sandbox.healthcheck()
      if (!healthy) {
        return {
          error:
            "Docker is not reachable. Make sure Docker is running and accessible from the server process.",
          hint: "Start Docker Desktop or the docker daemon.",
        }
      }

      const result = await sandbox.run({
        language: String(args.language),
        code: String(args.code),
        timeoutMs: Number(
          process.env.KAMI_SANDBOX_TIMEOUT_MS ?? 30_000
        ),
        memoryLimitMb: Number(
          process.env.KAMI_SANDBOX_MEMORY_MB ?? 128
        ),
      })

      return {
        output: result.output.slice(0, 8000),
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        timed_out: result.timedOut,
        language: args.language,
      }
    },
  })

  // ---- Phase 6: semantic memory search ----
  registerTool({
    name: "memory_semantic_search",
    toolset: "general",
    description:
      "Search memories by semantic meaning using embeddings. Finds conceptually similar memories even when exact keywords don't match. For example, 'revenue trends' matches memories about 'sales growth' or 'income patterns'.",
    risk: "read",
    schema: objectSchema(
      {
        query: {
          type: "string",
          description: "Natural language query describing what to find.",
        },
        limit: { type: "number", description: "Max results (default 10)." },
      },
      ["query"]
    ),
    handler: async (args, ctx) => {
      const provider = createEmbeddingMemoryProvider(ctx)
      return await provider.search({
        query: String(args.query),
        limit: Number(args.limit ?? 10),
      })
    },
  })

  // ---- Phase 6: dialectic contradictions ----
  registerTool({
    name: "memory_contradictions",
    toolset: "general",
    description:
      "Check if a statement contradicts any existing beliefs in KAMI's dialectic memory. Returns conflicting beliefs with similarity scores. Use this before storing new factual memories to detect contradictions and trigger consolidation.",
    risk: "read",
    schema: objectSchema(
      {
        statement: {
          type: "string",
          description: "The statement to check for contradictions.",
        },
      },
      ["statement"]
    ),
    handler: async (args, ctx) => {
      const provider = createDialecticMemoryProvider(ctx)
      const contradictions = await provider.findContradictions(
        String(args.statement)
      )

      if (contradictions.length === 0) {
        return { contradictions: [], note: "No conflicting beliefs found." }
      }

      return {
        contradictions: contradictions.map((c) => ({
          belief_id: c.belief.id,
          thesis: c.belief.thesis,
          confidence: c.belief.confidence,
          contradiction_score: Math.round(c.score * 100) / 100,
        })),
        suggested_action:
          "Review these contradictions. If the new statement is more accurate, use memory_manage to update or deprecate the conflicting belief with a synthesis.",
      }
    },
  })

  // ---- Phase 6: memory profile ----
  registerTool({
    name: "memory_profile",
    toolset: "general",
    description:
      "Get a summary of KAMI's memory profile including dialectic beliefs, confidence distribution, and memories needing consolidation.",
    risk: "read",
    schema: objectSchema({}),
    handler: async (_args, ctx) => {
      const dialectic = createDialecticMemoryProvider(ctx)
      return await dialectic.getProfile()
    },
  })

  registerTool({
    name: "autonomy_status",
    toolset: "general",
    description:
      "Return KAMI's current autonomy policy, approval behavior, mutation limits, and evaluation-harness status.",
    risk: "read",
    schema: objectSchema({}),
    handler: async (_args, ctx) => buildAutonomySnapshot(ctx.config),
  })

  registerTool({
    name: "autonomy_plan",
    toolset: "general",
    description:
      "Evaluate a proposed sequence of tool calls against KAMI's autonomy policy before executing it. Use this for multi-step plans.",
    risk: "read",
    schema: objectSchema(
      {
        objective: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: { type: "string" },
              args: { type: "object" },
            },
            required: ["tool"],
            additionalProperties: false,
          },
        },
      },
      ["objective", "actions"]
    ),
    handler: async (args, ctx) => {
      const actions = Array.isArray(args.actions) ? args.actions as any[] : []
      let mutationCount = 0

      return {
        objective: String(args.objective),
        policy: buildAutonomySnapshot(ctx.config),
        actions: actions.map((action, index) => {
          const tool = getTool(String(action.tool))

          if (!tool) {
            return {
              index,
              tool: action.tool,
              allowed: false,
              approval_required: false,
              reason: "Unknown tool.",
            }
          }

          const decision = evaluateAutonomy(tool, ctx.config, {
            forcedDestructiveApproval:
              tool.risk === "destructive" &&
              (ctx.config.approvalRequired || ctx.config.destructiveTools.includes(tool.name)),
          })
          const isMutation = tool.risk === "mutating" || tool.risk === "destructive"
          mutationCount += isMutation ? 1 : 0

          return {
            index,
            ...decision,
            within_mutation_limit:
              !isMutation || mutationCount <= ctx.config.autonomyMaxMutationsPerTurn,
          }
        }),
        mutation_count: mutationCount,
        max_mutations_per_turn: ctx.config.autonomyMaxMutationsPerTurn,
      }
    },
  })

  registerTool({
    name: "evaluation_run",
    toolset: "general",
    description:
      "Run KAMI's deterministic evaluation harness for registry coverage, report artifact generation, quick actions, and autonomy policy.",
    risk: "read",
    schema: objectSchema({}),
    handler: async (_args, ctx) => {
      if (!ctx.config.evalHarnessEnabled) {
        return {
          enabled: false,
          error: "Evaluation harness is disabled. Set KAMI_EVAL_HARNESS_ENABLED=true.",
        }
      }

      return {
        enabled: true,
        result: runKamiEvaluationHarness(ctx),
      }
    },
  })
}
