/**
 * KAMI RPC Executor — hermes-style execute_code for Node.js.
 *
 * Spawns a child process that can call KAMI tools via IPC (process.send).
 * Only read + safe tools are exposed. Mutating/destructive tools are excluded.
 *
 * Architecture:
 *   Parent (this)                          Child (script.js)
 *   ─────────────                          ──────────────────
 *   1. generateStub() → kami_tools.js
 *   2. Write script.js to tmpdir
 *   3. fork() script.js
 *   4. child.on('message', handler)  ───→  require('./kami_tools').list_products({...})
 *   5. dispatchTool(name, args, ctx)  ←───  process.send({type:'tool_call', id, name, args})
 *   6. child.send({id, result})      ───→  await response → continue processing
 *   7. Collect stdout                         console.log(finalResult)
 *   8. child.on('exit') → return result
 */

import { fork } from "node:child_process"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import type { ToolEntry } from "../tools/registry"
import type { KamiCtx, KamiToolRisk } from "../types"

// ── Types ──

export type RpcResult = {
  output: string
  exitCode: number
  durationMs: number
  timedOut: boolean
  toolCallsMade: number
  toolCallLog: Array<{ tool: string; durationMs: number }>
}

type RpcRequest = {
  type: "tool_call"
  id: number
  name: string
  args: Record<string, unknown>
}

type RpcResponse = {
  id: number
  result?: unknown
  error?: string
}

// ── Limits ──

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TOOL_CALLS = 30
const MAX_STDOUT_BYTES = 50_000
const MAX_RESULT_CHARS = 100_000

// ── Environment scrubbing ──

const SECRET_SUBSTRINGS = [
  "KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL",
  "PASSWD", "AUTH", "DSN", "WEBHOOK", "API",
]
const SAFE_ENV_PREFIXES = [
  "PATH", "HOME", "USER", "LANG", "LC_", "TERM",
  "TMPDIR", "TMP", "TEMP", "SHELL", "LOGNAME",
  "NODE", "npm_", "XDG_", "VIRTUAL_ENV", "CONDA",
]

function scrubEnv(source: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    // Block secrets
    if (SECRET_SUBSTRINGS.some((s) => key.toUpperCase().includes(s))) continue
    // Allow safe prefixes
    if (SAFE_ENV_PREFIXES.some((p) => key.startsWith(p))) {
      clean[key] = value
      continue
    }
  }
  return clean
}

// ── Stub code generator ──

/**
 * Generate the kami_tools.js content.
 * Each allowed tool becomes an async function that calls _call('name', args).
 * Also generates a _kami_runtime helper that handles IPC.
 */
function generateKamiToolsStub(allowedTools: ToolEntry[]): string {
  const exports: string[] = []

  for (const tool of allowedTools) {
    const requiredParams = (tool.schema.required as string[] | undefined) ?? []
    const properties = (tool.schema.properties as Record<string, { type?: string; description?: string }> | undefined) ?? {}

    // Build JSDoc
    const paramDocs: string[] = []
    for (const key of Object.keys(properties)) {
      const prop = properties[key]
      const optional = requiredParams.includes(key) ? "" : " (optional)"
      paramDocs.push(` * @param {${prop.type ?? "any"}}${optional} args.${key} - ${prop.description ?? key}`)
    }

    const jsdoc = [
      "/**",
      ` * ${tool.description?.split(".")[0] ?? tool.name}.`,
      ...paramDocs,
      ` * @returns {Promise<any>}`,
      " */",
    ].join("\n")

    // Generate function: takes (args) → passes to _call
    exports.push(`${jsdoc}
function ${tool.name}(args = {}) {
  return _call('${tool.name}', args);
}`)
  }

  // Build module exports
  const exportNames = allowedTools.map((t) => t.name)

  return `/**
 * Auto-generated KAMI tools RPC stubs.
 * Generated at: ${new Date().toISOString()}
 * Allowed tools: ${exportNames.length} (read + safe risk only)
 */

// ── IPC runtime (injected) ──
${IPC_RUNTIME_SOURCE}

// ── Tool stubs ──

${exports.join("\n\n")}

module.exports = {
${exportNames.map((n) => `  ${n},`).join("\n")}
  json_parse,
  retry,
  sleep,
};
`
}

// ── IPC runtime (embedded in generated stub) ──

const IPC_RUNTIME_SOURCE = `
let _callId = 0;
let _activeCalls = 0;
let _syncCodeDone = false;
const _pending = new Map();

function _maybeExit() {
  if (_syncCodeDone && _activeCalls === 0) {
    // All sync code finished + no pending RPC calls → exit cleanly
    process.exit(0);
  }
}

// Listen for responses from parent
process.on('message', (msg) => {
  if (msg && typeof msg === 'object' && msg.id !== undefined) {
    const entry = _pending.get(msg.id);
    if (entry) {
      _pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(msg.error));
      } else {
        entry.resolve(msg.result);
      }
    }
  }
});

/**
 * Send a tool call to the parent process and wait for the result.
 */
function _call(name, args) {
  const id = ++_callId;
  _activeCalls++;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    try {
      process.send({ type: 'tool_call', id, name, args });
    } catch (err) {
      _pending.delete(id);
      _activeCalls--;
      reject(err);
    }
  }).finally(() => {
    _activeCalls--;
    _maybeExit();
  });
}
// ── Helpers (synchronous, no tool calls) ──

/**
 * Parse JSON tolerant of control characters (strict=false).
 * Use this instead of JSON.parse() when processing output from tools
 * that may contain raw tabs/newlines in strings.
 */
function json_parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try to sanitize common issues
    const cleaned = text
      .replace(/[\\x00-\\x1f]/g, ' ')
      .replace(/,\\s*}/g, '}')
      .replace(/,\\s*]/g, ']');
    return JSON.parse(cleaned);
  }
}

/**
 * Retry a function with exponential backoff.
 */
async function retry(fn, maxAttempts = 3, delay = 2000) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

/**
 * Pause execution for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// After the main script's synchronous code finishes (next tick),
// mark done and check if we can exit.
setImmediate(() => {
  _syncCodeDone = true;
  _maybeExit();
});
`

// ── Main executor ──

export class KamiRpcExecutor {
  /**
   * Execute JavaScript code in a child process with RPC access to KAMI tools.
   */
  static async execute(
    code: string,
    ctx: KamiCtx
  ): Promise<RpcResult> {
    // Import listTools lazily to avoid circular dependency at module load
    const { listTools } = require("../tools/registry")

    // Gather allowed tools: only read + safe risk
    const allTools = listTools(ctx.toolset)
    const allowedTools = allTools.filter(
      (t: ToolEntry) => t.risk === "read" || t.risk === "safe"
    )

    if (allowedTools.length === 0) {
      return {
        output: "No read/safe tools available for this toolset.",
        exitCode: 1,
        durationMs: 0,
        timedOut: false,
        toolCallsMade: 0,
        toolCallLog: [],
      }
    }

    // Create temp directory
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "kami_exec_"))

    try {
      // 1. Generate and write kami_tools.js
      const stubSource = generateKamiToolsStub(allowedTools)
      fs.writeFileSync(path.join(tmpdir, "kami_tools.js"), stubSource, "utf-8")

      // 2. Write user's script with helpers injected at top
      const helpersPreamble = `
// KAMI sandbox helpers (injected)
const { json_parse, retry, sleep } = require("./kami_tools");

`;
      fs.writeFileSync(path.join(tmpdir, "script.js"), helpersPreamble + code, "utf-8")

      // 3. Fork child process
      const childEnv = scrubEnv(process.env)
      // Ensure UTF-8 for stdio
      childEnv.NODE_OPTIONS = (childEnv.NODE_OPTIONS || "") + " --max-old-space-size=256"

      const scriptPath = path.join(tmpdir, "script.js")
      const child = fork(scriptPath, [], {
        cwd: tmpdir,
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        execArgv: [],
      })

      // ── State ──
      let stdout = ""
      let stderr = ""
      let toolCallsMade = 0
      const toolCallLog: Array<{ tool: string; durationMs: number }> = []
      let timedOut = false
      const start = Date.now()

      // ── IPC handler ──
      child.on("message", async (msg: RpcRequest) => {
        if (!msg || msg.type !== "tool_call") return

        if (toolCallsMade >= MAX_TOOL_CALLS) {
          child.send({
            id: msg.id,
            error: `Tool call limit reached (${MAX_TOOL_CALLS}). No more tool calls allowed.`,
          } satisfies RpcResponse)
          return
        }

        const callStart = Date.now()

        try {
          // Dispatch the tool via KAMI's dispatcher, skipping approval
          // (only read/safe tools are exposed, so approval is never needed)
          const { executeApprovedTool } = require("../tools/dispatcher")

          const dispatched = await executeApprovedTool(
            {
              name: msg.name,
              arguments: msg.args,
            },
            // Pass sandbox marker so tools like call_api can reject mutations
            { ...ctx, _sandboxRpc: true } as any
          )

          toolCallsMade++
          const duration = Date.now() - callStart
          toolCallLog.push({ tool: msg.name, durationMs: duration })

          // Serialize the result for IPC
          const resultStr = safeSerialize(dispatched.result, MAX_RESULT_CHARS)

          child.send({
            id: msg.id,
            result: resultStr,
          } satisfies RpcResponse)
        } catch (err: any) {
          toolCallsMade++
          const duration = Date.now() - callStart
          toolCallLog.push({ tool: msg.name, durationMs: duration })

          child.send({
            id: msg.id,
            error: err?.message ?? "Tool dispatch failed",
          } satisfies RpcResponse)
        }
      })

      // ── Stdio collection ──
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_STDOUT_BYTES) {
          stdout += chunk.toString("utf-8")
        }
      })

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8")
      })

      // ── Wait for exit with timeout ──
      const result = await new Promise<RpcResult>((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true
          child.kill("SIGKILL")
        }, DEFAULT_TIMEOUT_MS)

        child.on("exit", (exitCode) => {
          clearTimeout(timer)
          const duration = Date.now() - start

          // Combine stdout + stderr
          let output = stdout
          if (stderr) {
            output = output ? output + "\n--- stderr ---\n" + stderr : stderr
          }
          // Truncate
          if (output.length > MAX_STDOUT_BYTES) {
            const omitted = output.length - MAX_STDOUT_BYTES
            output =
              output.slice(0, Math.floor(MAX_STDOUT_BYTES * 0.4)) +
              `\n\n... [OUTPUT TRUNCATED — ${omitted} chars omitted] ...\n\n` +
              output.slice(-Math.floor(MAX_STDOUT_BYTES * 0.6))
          }

          resolve({
            output: output.trimEnd() || "(no output)",
            exitCode: exitCode ?? 1,
            durationMs: duration,
            timedOut,
            toolCallsMade,
            toolCallLog,
          })
        })

        child.on("error", (err) => {
          clearTimeout(timer)
          resolve({
            output: `Child process error: ${err.message}`,
            exitCode: 1,
            durationMs: Date.now() - start,
            timedOut: false,
            toolCallsMade,
            toolCallLog,
          })
        })
      })

      return result
    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(tmpdir, { recursive: true, force: true })
      } catch {
        // Best effort cleanup
      }
    }
  }
}

// ── Helpers ──

function safeSerialize(value: unknown, maxChars: number): string {
  try {
    const str = typeof value === "string" ? value : JSON.stringify(value)
    if (str.length <= maxChars) return str
    return str.slice(0, maxChars) + `\n\n... [TRUNCATED ${str.length - maxChars} chars] ...`
  } catch {
    return String(value).slice(0, maxChars)
  }
}
