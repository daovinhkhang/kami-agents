/**
 * File manipulation tools for general tasks.
 * read_file, write_file, search_files, patch
 */

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"
import { registerTool } from "../registry"

// ── Security constants ──

const BLOCKED_PREFIXES = [
  "/etc/",
  "/proc/",
  "/sys/",
  "/dev/",
  "/boot/",
  "/var/run/docker.sock",
]

const BLOCKED_PATH_SUFFIXES = [".env", ".pem", ".key", "id_rsa", "credentials.json"]

const MAX_READ_BYTES = 500_000 // 500KB
const MAX_SEARCH_RESULTS = 50
const WORKSPACE_ROOT = process.cwd()

// ── Helpers ──

function isSafePath(filePath: string, allowWrite = false): { safe: boolean; reason?: string } {
  const resolved = path.resolve(filePath)

  for (const prefix of BLOCKED_PREFIXES) {
    // Also match the directory itself (e.g. "/etc" should match "/etc/")
    if (resolved.startsWith(prefix) || resolved === prefix.replace(/\/$/, "")) {
      return { safe: false, reason: `Path "${prefix}..." is blocked for security.` }
    }
  }

  const basename = path.basename(resolved)
  for (const suffix of BLOCKED_PATH_SUFFIXES) {
    if (basename.endsWith(suffix) || basename === suffix) {
      return { safe: false, reason: `File "${basename}" is blocked (sensitive).` }
    }
  }

  if (allowWrite && !resolved.startsWith(WORKSPACE_ROOT)) {
    return { safe: false, reason: `Write outside workspace "${WORKSPACE_ROOT}" requires approval.` }
  }

  return { safe: true }
}

function expandUser(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2))
  }
  return filePath
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
// read_file
// ═══════════════════════════════════════════════════════════════════════════

export const readFileHandler = async (args: Record<string, unknown>) => {
  const rawPath = String(args.path ?? "")
  const filePath = expandUser(rawPath)
  const offset = Math.max(1, Number(args.offset ?? 1))
  const limit = Math.min(Math.max(1, Number(args.limit ?? 500)), 2000)

  if (!filePath) {
    return { error: "No file path provided.", hint: "Provide a 'path' argument." }
  }

  const safety = isSafePath(filePath)
  if (!safety.safe) {
    return { error: safety.reason, hint: "Try a different path." }
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, "utf-8")
  } catch (err: any) {
    return { error: `Cannot read file: ${err.message}`, path: rawPath }
  }

  if (content.length > MAX_READ_BYTES) {
    return {
      error: `File is too large (${(content.length / 1024 / 1024).toFixed(1)} MB). Use read_file with offset/limit to read a smaller section.`,
      path: rawPath,
      total_size: content.length,
    }
  }

  const lines = content.split("\n")
  const totalLines = lines.length
  const startIdx = offset - 1
  const endIdx = Math.min(startIdx + limit, totalLines)
  const selectedLines = lines.slice(startIdx, endIdx)

  const result = selectedLines
    .map((line, i) => `${String(startIdx + i + 1).padStart(4, " ")}\t${line}`)
    .join("\n")

  return {
    path: rawPath,
    total_lines: totalLines,
    lines: `${offset}-${endIdx}`,
    content: result,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// write_file
// ═══════════════════════════════════════════════════════════════════════════

export const writeFileHandler = async (args: Record<string, unknown>) => {
  const rawPath = String(args.path ?? "")
  const filePath = expandUser(rawPath)
  const content = String(args.content ?? "")

  if (!filePath) {
    return { error: "No file path provided.", hint: "Provide 'path' and 'content' arguments." }
  }

  const safety = isSafePath(filePath, true)
  if (!safety.safe) {
    return { error: safety.reason, hint: "Write inside the workspace or create a commerce_draft instead." }
  }

  // Detect original line endings + BOM
  let originalLineEnding = "\n" // default LF
  let originalBom = ""
  try {
    const existing = fs.readFileSync(filePath, "utf-8")
    originalLineEnding = existing.includes("\r\n") ? "\r\n" : "\n"
    originalBom = existing.startsWith("﻿") ? "﻿" : ""
  } catch {
    // File doesn't exist yet — use defaults
  }

  // Ensure content has correct line endings
  const normalizedContent = originalBom + content.replace(/\r\n|\n/g, originalLineEnding)

  // Atomic write: write to temp file in same directory, then rename
  const dir = path.dirname(filePath)
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ok if exists */ }

  const tmpFile = path.join(dir, `.kami_write_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tmpFile, normalizedContent, "utf-8")
    fs.renameSync(tmpFile, filePath)
    return { path: rawPath, written: true, bytes: Buffer.byteLength(normalizedContent, "utf-8") }
  } catch (err: any) {
    try { fs.unlinkSync(tmpFile) } catch { /* best effort */ }
    return { error: `Failed to write file: ${err.message}`, path: rawPath }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// search_files
// ═══════════════════════════════════════════════════════════════════════════

export const searchFilesHandler = async (args: Record<string, unknown>) => {
  const pattern = String(args.pattern ?? "")
  const target = String(args.target ?? "content") as "content" | "files"
  const searchPath = expandUser(String(args.path ?? "."))
  const fileGlob = args.file_glob ? String(args.file_glob) : undefined
  const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 100)
  const contextLines = Math.min(Math.max(0, Number(args.context ?? 0)), 10)

  if (!pattern) {
    return { error: "No search pattern provided.", hint: "Provide a 'pattern' argument." }
  }

  const safety = isSafePath(searchPath)
  if (!safety.safe) {
    return { error: safety.reason, hint: "Search a different directory." }
  }

  const resolvedPath = path.resolve(searchPath)
  if (!fs.existsSync(resolvedPath)) {
    return { error: `Path not found: ${searchPath}`, hint: "Check the path and try again." }
  }

  try {
    // Try ripgrep first, fall back to grep
    let rgAvailable = false
    try {
      execSync("rg --version", { stdio: "ignore", timeout: 2000 })
      rgAvailable = true
    } catch { /* use grep */ }

    if (target === "files") {
      // File name search
      let files: string[]
      if (rgAvailable) {
        const globFilter = fileGlob ? ` -g '${fileGlob}'` : ""
        const result = execSync(
          `rg --files --sortr=modified${globFilter} '${resolvedPath}' 2>/dev/null | head -n ${limit}`,
          { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
        )
        files = result.trim().split("\n").filter(Boolean)
      } else {
        const namePattern = fileGlob || `*${pattern}*`
        const result = execSync(
          `find '${resolvedPath}' -type f -name '${namePattern}' 2>/dev/null | head -n ${limit}`,
          { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
        )
        files = result.trim().split("\n").filter(Boolean)
      }

      return {
        pattern,
        matches: files.map((f) => ({ file: f.replace(resolvedPath + "/", "") })),
        count: files.length,
        truncated: files.length >= limit,
      }
    } else {
      // Content search
      const contextFlag = contextLines > 0 ? ` -C ${contextLines}` : ""
      const globFlag = fileGlob ? ` -g '${fileGlob}'` : ""
      let result: string
      if (rgAvailable) {
        const escapedPattern = pattern.replace(/'/g, "'\\''")
        result = execSync(
          `rg --line-number --no-heading --with-filename${contextFlag}${globFlag} '${escapedPattern}' '${resolvedPath}' 2>/dev/null | head -n ${limit}`,
          { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
        )
      } else {
        const escapedPattern = pattern.replace(/'/g, "'\\''")
        result = execSync(
          `grep -rnH --exclude-dir='.*' ${contextLines > 0 ? `-C ${contextLines}` : ""} '${escapedPattern}' '${resolvedPath}' 2>/dev/null | head -n ${limit}`,
          { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
        )
      }

      const matches = result.trim().split("\n").filter(Boolean).map((line) => {
        // Parse: file:line:content or file-line-content (rg default)
        const firstColon = line.indexOf(":")
        const secondColon = line.indexOf(":", firstColon + 1)
        if (firstColon >= 0 && secondColon >= 0) {
          return {
            file: line.slice(0, firstColon),
            line: parseInt(line.slice(firstColon + 1, secondColon), 10),
            content: line.slice(secondColon + 1).trim(),
          }
        }
        return { content: line }
      })

      return {
        pattern,
        matches,
        count: matches.length,
        truncated: matches.length >= limit,
      }
    }
  } catch (err: any) {
    if (err.status === 1 && !err.stderr) {
      // grep returns exit code 1 for "no matches"
      return { pattern, matches: [], count: 0 }
    }
    return { error: `Search failed: ${err.message}`, pattern }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// patch
// ═══════════════════════════════════════════════════════════════════════════

function fuzzyIndexOf(content: string, search: string): number {
  // Strategy 1: exact match
  const exact = content.indexOf(search)
  if (exact >= 0) return exact

  // Strategy 2: trim each line, then compare
  const lines = content.split("\n")
  const searchLines = search.split("\n")
  for (let i = 0; i <= lines.length - searchLines.length; i++) {
    const trimmedBlock = lines.slice(i, i + searchLines.length).map((l) => l.trim()).join("\n")
    const trimmedSearch = searchLines.map((l) => l.trim()).join("\n")
    if (trimmedBlock === trimmedSearch) {
      // Return position of the original block
      const startIdx = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0)
      return startIdx
    }
  }

  // Strategy 3: collapse whitespace
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim()
  const collapsedContent = lines.map(collapse).join("\n")
  const collapsedSearch = searchLines.map(collapse).join("\n")
  const collapsedIdx = collapsedContent.indexOf(collapsedSearch)
  if (collapsedIdx >= 0) {
    // Find approximate position in original
    let charCount = 0
    let collapsedCount = 0
    for (const line of lines) {
      const collapsed = collapse(line)
      if (collapsedCount + collapsed.length >= collapsedIdx) {
        return charCount + Math.max(0, collapsedIdx - collapsedCount)
      }
      charCount += line.length + 1 // +1 for newline
      collapsedCount += collapsed.length + 1
    }
    return charCount
  }

  return -1
}

export const patchHandler = async (args: Record<string, unknown>) => {
  const mode = String(args.mode ?? "replace")
  const filePath = expandUser(String(args.path ?? ""))

  if (mode === "replace") {
    const oldString = String(args.old_string ?? "")
    const newString = String(args.new_string ?? "")
    const replaceAll = args.replace_all === true

    if (!filePath || !oldString) {
      return { error: "replace mode requires 'path' and 'old_string'.", hint: "Provide both arguments." }
    }

    const safety = isSafePath(filePath, true)
    if (!safety.safe) {
      return { error: safety.reason, hint: "Patch a file inside the workspace." }
    }

    let content: string
    try {
      content = fs.readFileSync(filePath, "utf-8")
    } catch (err: any) {
      return { error: `Cannot read file: ${err.message}`, path: filePath }
    }

    if (oldString === newString) {
      return { error: "old_string and new_string are identical — no changes to make.", path: filePath }
    }

    const matchIdx = fuzzyIndexOf(content, oldString)
    if (matchIdx < 0) {
      return {
        error: "old_string not found in file. Check whitespace and indentation.",
        hint: "Try reading the file first to see the exact content.",
        path: filePath,
      }
    }

    // Count occurrences
    let occurrences = 0
    let idx = -1
    while ((idx = content.indexOf(oldString, idx + 1)) >= 0) {
      occurrences++
    }

    if (occurrences > 1 && !replaceAll) {
      return {
        error: `old_string matched ${occurrences} times. Set replace_all: true to replace all, or make old_string more specific.`,
        path: filePath,
        occurrences,
      }
    }

    const newContent = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.slice(0, matchIdx) + newString + content.slice(matchIdx + oldString.length)

    // Atomic write
    const tmpFile = filePath + `.kami_patch_${Date.now()}.tmp`
    try {
      fs.writeFileSync(tmpFile, newContent, "utf-8")
      fs.renameSync(tmpFile, filePath)

      // Build unified diff
      const oldLines = content.split("\n")
      const newLines = newContent.split("\n")
      const changedLines = Math.abs(newLines.length - oldLines.length)

      return {
        path: filePath,
        patched: true,
        replacements: replaceAll ? occurrences : 1,
        line_delta: newLines.length - oldLines.length > 0
          ? `+${changedLines} lines`
          : changedLines > 0
            ? `-${changedLines} lines`
            : "same length",
      }
    } catch (err: any) {
      try { fs.unlinkSync(tmpFile) } catch { /* best effort */ }
      return { error: `Failed to apply patch: ${err.message}`, path: filePath }
    }
  }

  return {
    error: `Unsupported patch mode: "${mode}". Use mode: "replace".`,
    hint: "Provide mode: 'replace' with path, old_string, and new_string.",
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export const registerFileTools = () => {
  registerTool({
    name: "read_file",
    toolset: "general",
    description:
      "Read a file from the server filesystem. Lines are 1-indexed. Use offset/limit to read a specific range. Blocked: /etc/, /proc/, /sys/, and .env/.pem credential files. Max 500KB per read.",
    risk: "read",
    schema: objectSchema(
      {
        path: { type: "string", description: "Absolute or relative path to the file." },
        offset: { type: "number", description: "Line to start from (1-indexed, default 1)." },
        limit: { type: "number", description: "Max lines to read (default 500, max 2000)." },
      },
      ["path"]
    ),
    handler: readFileHandler,
  })

  registerTool({
    name: "write_file",
    toolset: "general",
    description:
      "Write content to a file (always overwrites). Atomic write via temp file + rename. Only allowed inside the workspace directory. Outside the workspace, create a commerce_draft instead.",
    risk: "mutating",
    schema: objectSchema(
      {
        path: { type: "string", description: "Path to the file to write." },
        content: { type: "string", description: "Complete content to write." },
      },
      ["path", "content"]
    ),
    handler: writeFileHandler,
  })

  registerTool({
    name: "search_files",
    toolset: "general",
    description:
      "Search file contents (target='content') or find files by name (target='files'). Uses ripgrep when available, fallback to grep. Returns matches with file path, line number, and content snippet. Max 50 results.",
    risk: "read",
    schema: objectSchema(
      {
        pattern: {
          type: "string",
          description: "Regex pattern for content search, or glob for file name search.",
        },
        target: {
          type: "string",
          enum: ["content", "files"],
          description: "'content' searches inside files, 'files' finds files by name.",
        },
        path: { type: "string", description: "Directory to search in (default '.')." },
        file_glob: { type: "string", description: "Filter files by glob (e.g. '*.ts')." },
        limit: { type: "number", description: "Max results (default 50, max 100)." },
        context: { type: "number", description: "Context lines around each match (default 0)." },
      },
      ["pattern"]
    ),
    handler: searchFilesHandler,
  })

  registerTool({
    name: "patch",
    toolset: "general",
    description:
      "Replace text in a file with exact or fuzzy matching. mode='replace': replace old_string with new_string. Supports 3 strategies: exact match, line-trimmed, and whitespace-collapsed. Use replace_all: true to replace all occurrences. Atomic write via temp file + rename.",
    risk: "mutating",
    schema: objectSchema(
      {
        mode: { type: "string", enum: ["replace"], description: "Operation mode (default 'replace')." },
        path: { type: "string", description: "File path." },
        old_string: { type: "string", description: "Text to find." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", description: "Replace all occurrences (default false)." },
      },
      ["mode", "path", "old_string", "new_string"]
    ),
    handler: patchHandler,
  })
}
