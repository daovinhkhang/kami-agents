/**
 * Web extraction tool — fetch URLs and extract readable content.
 */

import { registerTool } from "../registry"

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

// ── SSRF protection ──

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // cloud metadata
  "[::1]",
  "metadata.google.internal",
]

const BLOCKED_IP_PATTERNS = [
  /^10\./,        /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./,  /^fc00:/, /^fe80:/,
]

function isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { safe: false, reason: `Invalid URL: ${rawUrl}` }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: `Blocked protocol: ${url.protocol}` }
  }

  const host = url.hostname.toLowerCase()

  for (const blocked of BLOCKED_HOSTS) {
    if (host === blocked || host.endsWith("." + blocked)) {
      return { safe: false, reason: `Blocked host: ${host}` }
    }
  }

  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(host)) {
      return { safe: false, reason: `Blocked internal IP: ${host}` }
    }
  }

  return { safe: true }
}

// ── HTML-to-text extraction ──

function extractText(html: string, maxChars: number): string {
  // Simple tag stripping + whitespace normalization
  let text = html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Replace block elements with newlines
    .replace(/<\/?(p|div|article|section|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    // Trim each line
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")

  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + `\n\n... [TRUNCATED — ${text.length - maxChars} more chars]`
  }

  return text
}

// ── Title extraction ──

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].trim().replace(/\s+/g, " ") : ""
}

const MAX_URLS = 5
const MAX_CONTENT_PER_URL = 100_000 // 100KB

export const webExtractHandler = async (args: Record<string, unknown>) => {
  const urls: string[] = Array.isArray(args.urls)
    ? args.urls.slice(0, MAX_URLS).map(String)
    : []

  if (urls.length === 0) {
    return { error: "No URLs provided.", hint: "Provide a 'urls' array (max 5 URLs)." }
  }

  const results: Array<{
    url: string
    title?: string
    content?: string
    error?: string
  }> = []

  for (const rawUrl of urls) {
    // SSRF check
    const safety = isSafeUrl(rawUrl)
    if (!safety.safe) {
      results.push({ url: rawUrl, error: safety.reason })
      continue
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(rawUrl, {
        headers: {
          "User-Agent": "KAMI/0.1 (commerce agent; +https://medusajs.com)",
          Accept: "text/html, text/plain, */*",
        },
        signal: controller.signal,
        redirect: "follow",
      })
      clearTimeout(timeout)

      if (!response.ok) {
        results.push({ url: rawUrl, error: `HTTP ${response.status}: ${response.statusText}` })
        continue
      }

      const contentType = response.headers.get("content-type") || ""
      const contentLength = parseInt(response.headers.get("content-length") || "0", 10)

      if (contentLength > 2 * 1024 * 1024) {
        results.push({ url: rawUrl, error: "Content too large (>2 MB). Use web_search or narrow the scope." })
        continue
      }

      const html = await response.text()
      const title = extractTitle(html)
      const text = extractText(html, MAX_CONTENT_PER_URL)

      results.push({
        url: rawUrl,
        title: title || undefined,
        content: text,
      })
    } catch (err: any) {
      results.push({ url: rawUrl, error: err?.message || "Fetch failed" })
    }
  }

  return { results, count: results.length }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════

export const registerWebTools = () => {
  registerTool({
    name: "web_extract",
    toolset: "general",
    description:
      "Extract readable text content from web pages. Fetches up to 5 URLs in parallel, strips HTML/CSS/JS, and returns plain text. Blocked: internal IPs, localhost, cloud metadata. Max 100KB per URL. Use when web_search results need deeper inspection.",
    risk: "read",
    schema: objectSchema(
      {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "List of URLs to extract content from (max 5).",
        },
      },
      ["urls"]
    ),
    handler: webExtractHandler,
  })
}
