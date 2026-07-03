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
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*[~/]/, reason: "rm with flags on system paths" },
  { pattern: /\brm\s+-[a-zA-Z]*[rf]/, reason: "rm recursive/force (always blocked)" },
  { pattern: /\bchmod\s+[0-7]*7[0-7]*7\b/, reason: "world-writable chmod" },
  { pattern: /\bchown\s+root\b/, reason: "chown to root" },
  { pattern: />\s*\/etc\//, reason: "redirect to /etc/" },
  { pattern: /\b(curl|wget)\b[\s\S]*\b169\.254/, reason: "http fetch to cloud metadata" },
  { pattern: /\b(curl|wget)\b[\s\S]*\b(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/, reason: "http fetch to internal IP" },
  { pattern: /\bshutdown\b/, reason: "shutdown" },
  { pattern: /\breboot\b/, reason: "reboot" },
  { pattern: /\bhalt\b|\bpoweroff\b/, reason: "system halt" },
  { pattern: /\bkill(all)?\s+-(9|SIGKILL)\b/, reason: "kill -9" },
  { pattern: /:\s*\(\s*\)\s*\{.*\}\s*;\s*:/, reason: "fork bomb" },
  { pattern: /\bdocker\s+(rm|stop|kill|rmi|prune)\b/, reason: "docker container manipulation" },
  { pattern: /\biptables\b|\bnft\b/, reason: "firewall modification" },
  { pattern: /\bufw\b/, reason: "firewall modification" },
  { pattern: /\bpasswd\b/, reason: "password modification" },
  { pattern: /\buseradd\b|\buserdel\b|\busermod\b|\bgroupadd\b/, reason: "user account manipulation" },
  { pattern: /\b(sudo|su|doas)\b/, reason: "privilege escalation" },
  { pattern: /\bdd\s+if=/, reason: "dd (disk write)" },
  { pattern: /\bmkfs\./, reason: "mkfs (create filesystem)" },
  { pattern: /\b(mount|umount)\b/, reason: "(un)mount" },
  { pattern: />\s*\/dev\//, reason: "redirect to device" },
  { pattern: /\beval\b|\bexec\b/, reason: "eval/exec (obfuscated execution)" },
  { pattern: /\bbase64\b\s+(-d|--decode)/, reason: "base64 decode (obfuscated payload)" },
  { pattern: /\bnc\b|\bncat\b|\bnetcat\b/, reason: "netcat (reverse shell risk)" },
  { pattern: /\/dev\/(tcp|udp)\//, reason: "bash network redirect (reverse shell)" },
]

/**
 * Normalize a command before pattern-matching so common shell-obfuscation
 * tricks cannot slip a blocked verb past the regex. execSync runs through a
 * shell, so `rm${IFS}-rf`, `r\m -rf`, and `"rm" -rf` all execute the same rm —
 * collapse those forms to a canonical string that the patterns can see.
 */
function normalizeCommand(command: string): string {
  return command
    // $IFS / ${IFS} used as a whitespace substitute
    .replace(/\$\{?IFS\}?/g, " ")
    // backslash-escaped chars: r\m -> rm, \/ -> /
    .replace(/\\(.)/g, "$1")
    // drop quote characters that split a token without changing what runs
    .replace(/['"]/g, "")
    // collapse all whitespace (including newlines/tabs) to single spaces
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function validateCommand(command: string): { allowed: boolean; reason?: string } {
  if (!command || !command.trim()) {
    return { allowed: false, reason: "Empty command." }
  }

  // Match against both the raw command and a normalized form so obfuscation
  // (variable whitespace, escapes, quotes) cannot bypass the blocklist.
  const normalized = normalizeCommand(command)
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(command) || pattern.test(normalized)) {
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
