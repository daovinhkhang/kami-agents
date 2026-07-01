/**
 * Terminal tool — execute shell commands on the server.
 *
 * SECURITY: This is the most powerful tool in KAMI. Commands run on the host.
 * Guardrails:
 *   - Risk: "destructive" — always requires approval
 *   - Command allowlist blocks known dangerous patterns
 *   - Timeout hard cap 30s
 *   - Output cap 10KB
 *   - Env scrubbed (no API keys)
 */

import { execSync } from "node:child_process"
import { registerTool } from "../registry"

// ── Constants ──

const MAX_TIMEOUT_SEC = 30
const MAX_OUTPUT_BYTES = 10_000

// ── Command allowlist / blocklist ──

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[rRf]+\s+)*[~/]/, reason: "rm with recursive/force on system paths" },
  { pattern: /\brm\s+-rf\b/, reason: "rm -rf (always blocked)" },
  { pattern: /\bchmod\s+777\b/, reason: "chmod 777" },
  { pattern: /\bchmod\s+[0-7]*7[0-7]*7\b/, reason: "world-writable chmod" },
  { pattern: /\bchown\s+root\b/, reason: "chown to root" },
  { pattern: />\s*\/etc\//, reason: "redirect to /etc/" },
  { pattern: /\bcurl\b.*\b169\.254/, reason: "curl to cloud metadata" },
  { pattern: /\bwget\b.*\b169\.254/, reason: "wget to cloud metadata" },
  { pattern: /\bcurl\b.*\b(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/, reason: "curl to internal IP" },
  { pattern: /\bshutdown\b/, reason: "shutdown" },
  { pattern: /\breboot\b/, reason: "reboot" },
  { pattern: /\bkill\s+-9\b/, reason: "kill -9" },
  { pattern: /\b:(){ :|:& };:\b/, reason: "fork bomb" },
  { pattern: /\bdocker\s+(rm|stop|kill)\b/, reason: "docker container manipulation" },
  { pattern: /\biptables\b/, reason: "iptables modification" },
  { pattern: /\bufw\b/, reason: "firewall modification" },
  { pattern: /\bpasswd\b/, reason: "password modification" },
  { pattern: /\buseradd\b|\buserdel\b/, reason: "user account manipulation" },
  { pattern: /\bdd\s+if=/, reason: "dd (disk write)" },
  { pattern: /\bmkfs\./, reason: "mkfs (create filesystem)" },
  { pattern: /\bmount\b/, reason: "mount" },
  { pattern: /\bumount\b/, reason: "unmount" },
  { pattern: />\s*\/dev\//, reason: "redirect to device" },
]

function validateCommand(command: string): { allowed: boolean; reason?: string } {
  if (!command || !command.trim()) {
    return { allowed: false, reason: "Empty command." }
  }

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Blocked: ${reason}` }
    }
  }

  return { allowed: true }
}

// ── Helpers ──

function scrubEnv(): Record<string, string> {
  const SECRET_SUBSTRINGS = ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL", "AUTH", "DSN", "WEBHOOK"]
  const SAFE_PREFIXES = ["PATH", "HOME", "USER", "LANG", "LC_", "TERM", "TMPDIR", "SHELL", "LOGNAME", "NODE", "npm_"]
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue
    if (SECRET_SUBSTRINGS.some((s) => key.toUpperCase().includes(s))) continue
    if (SAFE_PREFIXES.some((p) => key.startsWith(p))) {
      clean[key] = value
    }
  }
  return clean
}

// ── Handler ──

export const terminalHandler = async (args: Record<string, unknown>) => {
  const command = String(args.command ?? "").trim()
  const timeoutSec = Math.min(
    Math.max(1, Number(args.timeout ?? 30)),
    MAX_TIMEOUT_SEC
  )
  const workdir = args.workdir ? String(args.workdir) : undefined

  // Validate
  const validation = validateCommand(command)
  if (!validation.allowed) {
    return {
      error: validation.reason,
      hint: "Use a different approach or ask the admin for manual execution.",
      command,
    }
  }

  try {
    const start = Date.now()
    const options: any = {
      encoding: "utf-8",
      timeout: timeoutSec * 1000,
      maxBuffer: MAX_OUTPUT_BYTES * 2,
      env: scrubEnv(),
    }
    if (workdir) {
      options.cwd = workdir
    }

    const stdout = execSync(command, options)
    const durationMs = Date.now() - start

    let output = stdout || "(no output)"
    if (output.length > MAX_OUTPUT_BYTES) {
      const omitted = output.length - MAX_OUTPUT_BYTES
      output =
        output.slice(0, Math.floor(MAX_OUTPUT_BYTES * 0.4)) +
        `\n\n... [OUTPUT TRUNCATED — ${omitted} chars omitted] ...\n\n` +
        output.slice(-Math.floor(MAX_OUTPUT_BYTES * 0.6))
    }

    return {
      command,
      output: output.trim(),
      exit_code: 0,
      duration_ms: durationMs,
    }
  } catch (err: any) {
    const durationMs = 0 // rough, but error timing is not critical
    const stderr = err.stderr ?? ""
    const stdout = err.stdout ?? ""

    if (err.killed || err.signal) {
      return {
        command,
        error: `Command timed out after ${timeoutSec}s and was killed.`,
        output: (stdout + stderr || err.message).slice(0, MAX_OUTPUT_BYTES),
        timed_out: true,
      }
    }

    return {
      command,
      error: err.message?.slice(0, 500) || "Command failed",
      output: (stdout + stderr).slice(0, MAX_OUTPUT_BYTES) || undefined,
      exit_code: err.status ?? 1,
    }
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export const registerTerminalTools = () => {
  registerTool({
    name: "terminal",
    toolset: "general",
    description:
      "Execute a shell command on the server. DANGEROUS — always requires user approval. " +
      "Blocked: rm -rf, chmod 777, chown root, shutdown, iptables, curl/wget to internal IPs, " +
      "docker kill/stop, passwd, useradd, dd, mkfs, mount. " +
      "Limits: 30s timeout, 10KB output. " +
      "Use for inspecting files, running diagnostics, or executing approved operations. " +
      "For file reads, prefer read_file. For file searches, prefer search_files.",
    risk: "destructive",
    schema: objectSchema(
      {
        command: {
          type: "string",
          description: "Shell command to execute. Keep it focused — 30s timeout.",
        },
        timeout: {
          type: "number",
          description: "Max seconds to wait (default 30, max 30).",
        },
        workdir: {
          type: "string",
          description: "Working directory for this command.",
        },
      },
      ["command"]
    ),
    handler: terminalHandler,
  })
}
