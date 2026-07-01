/**
 * Smoke test for the 6 new general tools + execute_code RPC executor.
 * Calls each tool handler directly — no LLM needed.
 *
 * Usage:
 *   cd kami-app && npx tsx src/kami-runtime/tools/general/smoke-test.ts
 */

import { readFileHandler, writeFileHandler, searchFilesHandler, patchHandler } from "./file-tools"
import { webExtractHandler } from "./web-tools"
import { terminalHandler } from "./terminal-tool"
import { resetToolsForTests, getTool } from "../registry"
import { registerGeneralTools } from "./index"
import { registerFileTools } from "./file-tools"
import { registerWebTools } from "./web-tools"
import { registerTerminalTools } from "./terminal-tool"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// ── Minimal mock KamiCtx ──

const mockCtx: any = {
  scope: { resolve: () => ({}) },
  kami: {} as any,
  config: {
    timezone: "Asia/Ho_Chi_Minh",
    utcOffset: "+07:00",
    autonomyMode: "normal",
    autonomyMaxMutationsPerTurn: 5,
    evalHarnessEnabled: false,
  },
  sessionId: "smoke-test",
  userId: "test-user",
  toolset: "admin",
  executor: {} as any,
}

// ── Test helpers ──

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err: any) {
    failed++
    const msg = `FAIL  ${name}: ${err.message}`
    failures.push(msg)
    console.log(`  ${msg}`)
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

async function main() {
  // ── Setup: register all tools (needed for execute_code) ──
  resetToolsForTests()
  registerGeneralTools()
  registerFileTools()
  registerWebTools()
  registerTerminalTools()

  // ═══════════════════════════════════════════════════════════════
  // 1. read_file
  // ═══════════════════════════════════════════════════════════════

  // Use workspace-relative temp dir so write_file/patch are allowed
  const WORKSPACE = process.cwd()
  const TMP_DIR = path.join(WORKSPACE, "kami-smoke-test-tmp")
  fs.rmSync(TMP_DIR, { recursive: true, force: true }) // clean from previous run
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const TEST_FILE = path.join(TMP_DIR, "hello.txt")
  const TEST_CONTENT = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}: Hello KAMI!`).join("\n")
  fs.writeFileSync(TEST_FILE, TEST_CONTENT, "utf-8")

  await test("read_file — basic", async () => {
    const r = await readFileHandler({ path: TEST_FILE })
    assert(r.total_lines === 15, `expected 15 lines, got ${(r as any).total_lines}`)
    assert((r as any).content.includes("Line 1"), "should contain Line 1")
  })

  await test("read_file — offset+limit", async () => {
    const r = await readFileHandler({ path: TEST_FILE, offset: 5, limit: 3 })
    assert((r as any).lines === "5-7", `expected lines 5-7, got ${(r as any).lines}`)
    assert((r as any).content.includes("Line 5"), "should contain Line 5")
  })

  await test("read_file — blocked /etc/", async () => {
    const r = await readFileHandler({ path: "/etc/passwd" })
    assert(!!(r as any).error, "should be blocked")
    assert(
      (r as any).error.toLowerCase().includes("blocked"),
      `error should mention blocked: ${(r as any).error}`
    )
  })

  await test("read_file — missing file", async () => {
    const r = await readFileHandler({ path: "/no/such/file.txt" })
    assert(!!(r as any).error, "should error on missing file")
  })

  // ═══════════════════════════════════════════════════════════════
  // 2. write_file
  // ═══════════════════════════════════════════════════════════════

  await test("write_file — basic", async () => {
    const p = path.join(TMP_DIR, "write-test.txt")
    const r = await writeFileHandler({ path: p, content: "Hello from KAMI!" })
    assert((r as any).written === true, "should be written")
    assert(fs.readFileSync(p, "utf-8") === "Hello from KAMI!", "content should match")
  })

  await test("write_file — atomic (no partial writes)", async () => {
    const p = path.join(TMP_DIR, "atomic-test.txt")
    await writeFileHandler({ path: p, content: "First content" })
    const r = await writeFileHandler({ path: p, content: "Second content" })
    assert((r as any).written === true, "should be written")
    assert(fs.readFileSync(p, "utf-8") === "Second content", "content should be overwritten")
    const tmpFiles = fs.readdirSync(TMP_DIR).filter((f) => f.includes(".tmp"))
    assert(tmpFiles.length === 0, `no .tmp files should remain: ${tmpFiles.join(", ")}`)
  })

  await test("write_file — blocked outside workspace", async () => {
    const r = await writeFileHandler({ path: "/tmp/kami-unauthorized.txt", content: "bad" })
    if (!process.cwd().startsWith("/tmp")) {
      assert(!!(r as any).error, "should be blocked outside workspace")
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 3. search_files
  // ═══════════════════════════════════════════════════════════════

  await test("search_files — content search", async () => {
    const r = await searchFilesHandler({ pattern: "Hello KAMI", path: TMP_DIR })
    assert((r as any).count > 0, `should find matches, got ${JSON.stringify(r)}`)
  })

  await test("search_files — file name search", async () => {
    const r = await searchFilesHandler({ pattern: "*.txt", target: "files", path: TMP_DIR })
    assert((r as any).count >= 2, `should find >=2 .txt files, got ${(r as any).count}`)
  })

  await test("search_files — no pattern", async () => {
    const r = await searchFilesHandler({ pattern: "" })
    assert(!!(r as any).error, "should error on empty pattern")
  })

  await test("search_files — blocked path", async () => {
    const r = await searchFilesHandler({ pattern: "anything", path: "/etc" })
    assert(!!(r as any).error, "should be blocked")
  })

  // ═══════════════════════════════════════════════════════════════
  // 4. patch
  // ═══════════════════════════════════════════════════════════════

  const PATCH_FILE = path.join(TMP_DIR, "patch-test.txt")
  fs.writeFileSync(PATCH_FILE, "const x = 1\nconst y = 2\nconst z = 3", "utf-8")

  await test("patch — exact replace", async () => {
    const r = await patchHandler({
      mode: "replace",
      path: PATCH_FILE,
      old_string: "const y = 2",
      new_string: "const y = 42",
    })
    assert((r as any).patched === true, "should be patched")
    const content = fs.readFileSync(PATCH_FILE, "utf-8")
    assert(content.includes("const y = 42"), "should contain new value")
  })

  await test("patch — fuzzy (whitespace drift)", async () => {
    fs.writeFileSync(PATCH_FILE, "  const a = 10\n  const b = 20\n  const c = 30", "utf-8")
    const r = await patchHandler({
      mode: "replace",
      path: PATCH_FILE,
      old_string: "const b = 20",
      new_string: "const b = 200",
    })
    assert((r as any).patched === true, "fuzzy match should work")
    assert(fs.readFileSync(PATCH_FILE, "utf-8").includes("200"), "should contain new value")
  })

  await test("patch — old_string not found", async () => {
    const r = await patchHandler({
      mode: "replace",
      path: PATCH_FILE,
      old_string: "NONEXISTENT_CONTENT_999",
      new_string: "irrelevant",
    })
    assert(!!(r as any).error, "should error when not found")
  })

  await test("patch — replace_all", async () => {
    fs.writeFileSync(PATCH_FILE, "foo\nbar\nfoo\nbaz\n", "utf-8")
    const r = await patchHandler({
      mode: "replace",
      path: PATCH_FILE,
      old_string: "foo",
      new_string: "QUX",
      replace_all: true,
    })
    assert((r as any).patched === true, "should be patched")
    const content = fs.readFileSync(PATCH_FILE, "utf-8")
    assert(content === "QUX\nbar\nQUX\nbaz\n", `expected replaced, got: ${JSON.stringify(content)}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // 5. web_extract
  // ═══════════════════════════════════════════════════════════════

  await test("web_extract — SSRF: localhost blocked", async () => {
    const r = await webExtractHandler({ urls: ["http://localhost:3000"] })
    assert((r as any).results[0].error?.includes("Blocked"), `should block localhost: ${JSON.stringify(r)}`)
  })

  await test("web_extract — SSRF: 127.0.0.1 blocked", async () => {
    const r = await webExtractHandler({ urls: ["http://127.0.0.1/api"] })
    assert((r as any).results[0].error?.includes("Blocked"), `should block 127.0.0.1`)
  })

  await test("web_extract — SSRF: cloud metadata blocked", async () => {
    const r = await webExtractHandler({ urls: ["http://169.254.169.254/latest/meta-data/"] })
    assert((r as any).results[0].error?.includes("Blocked"), `should block cloud metadata`)
  })

  await test("web_extract — SSRF: private IP blocked (10.x)", async () => {
    const r = await webExtractHandler({ urls: ["http://10.0.0.1/"] })
    assert((r as any).results[0].error?.includes("Blocked"), `should block 10.x`)
  })

  await test("web_extract — SSRF: 192.168.x blocked", async () => {
    const r = await webExtractHandler({ urls: ["http://192.168.1.1/"] })
    assert((r as any).results[0].error?.includes("Blocked"), `should block 192.168.x`)
  })

  await test("web_extract — no urls", async () => {
    const r = await webExtractHandler({ urls: [] })
    assert(!!(r as any).error, "should error on empty urls")
  })

  await test("web_extract — real HTTP (example.com)", async () => {
    const r = await webExtractHandler({ urls: ["http://example.com"] })
    const result = (r as any).results?.[0]
    if (result?.error) {
      console.log(`    (note: real fetch result: ${result.error})`)
    } else {
      assert(!!result?.content, "should have content")
      assert(result.content.length > 0, "content should not be empty")
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 6. terminal
  // ═══════════════════════════════════════════════════════════════

  await test("terminal — basic echo", async () => {
    const r = await terminalHandler({ command: "echo hello" })
    assert((r as any).output?.includes("hello"), `should echo hello, got: ${JSON.stringify(r)}`)
  })

  await test("terminal — ls", async () => {
    const r = await terminalHandler({ command: `ls ${TMP_DIR}` })
    assert((r as any).exit_code === 0, "should succeed")
    assert((r as any).output?.includes("hello.txt"), "should list hello.txt")
  })

  await test("terminal — pwd", async () => {
    const r = await terminalHandler({ command: "pwd" })
    assert((r as any).exit_code === 0, "should succeed")
  })

  await test("terminal — blocked: rm -rf", async () => {
    const r = await terminalHandler({ command: "rm -rf /" })
    assert(!!(r as any).error, `should be blocked, got: ${JSON.stringify(r)}`)
  })

  await test("terminal — blocked: chmod 777", async () => {
    const r = await terminalHandler({ command: "chmod 777 /tmp/foo" })
    assert(!!(r as any).error, `should be blocked, got: ${JSON.stringify(r)}`)
  })

  await test("terminal — blocked: shutdown", async () => {
    const r = await terminalHandler({ command: "shutdown now" })
    assert(!!(r as any).error, `should be blocked`)
  })

  await test("terminal — blocked: curl to internal IP", async () => {
    const r = await terminalHandler({ command: "curl http://10.0.0.1/api" })
    assert(!!(r as any).error, `should be blocked`)
  })

  await test("terminal — blocked: passwd", async () => {
    const r = await terminalHandler({ command: "passwd root" })
    assert(!!(r as any).error, `should be blocked`)
  })

  await test("terminal — blocked: iptables", async () => {
    const r = await terminalHandler({ command: "iptables -L" })
    assert(!!(r as any).error, `should be blocked`)
  })

  await test("terminal — blocked: empty command", async () => {
    const r = await terminalHandler({ command: "" })
    assert(!!(r as any).error, "empty command should be blocked")
  })

  await test("terminal — node version", async () => {
    const r = await terminalHandler({ command: "node --version" })
    assert((r as any).exit_code === 0, "should succeed")
    assert((r as any).output?.startsWith("v"), `should be node version: ${(r as any).output}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // 7. execute_code (RPC sandbox)
  // ═══════════════════════════════════════════════════════════════

  const execCodeTool = getTool("execute_code")
  if (!execCodeTool) {
    console.log("  SKIP  execute_code tests — tool not registered")
  } else {
    await test("execute_code — basic JS", async () => {
      const r = await execCodeTool.handler(
        {
          code: `
            const x = 1 + 2;
            console.log(JSON.stringify({ result: x }));
          `,
        },
        mockCtx
      )
      const raw = (r as any)
      // Log everything for debugging
      if (raw.exit_code !== 0 || raw.output?.includes("stderr")) {
        console.log(`    DEBUG execute_code: exit=${raw.exit_code}, output=${JSON.stringify(raw.output).slice(0, 300)}`)
      }
      assert(raw.exit_code === 0, `should exit 0, got exit_code=${raw.exit_code}, output=${JSON.stringify(raw.output).slice(0, 200)}`)
      const parsed = JSON.parse(raw.output.replace(/--- stderr ---[\s\S]*$/, "").trim() || "{}")
      assert(parsed.result === 3, `expected 3, got ${JSON.stringify(parsed)}`)
    })

    await test("execute_code — empty code", async () => {
      const r = await execCodeTool.handler(
        { code: "" },
        mockCtx
      )
      assert(!!(r as any).error, "should error on empty code")
    })

    await test("execute_code — uses json_parse helper", async () => {
      const r = await execCodeTool.handler(
        {
          code: `
            const obj = json_parse('{"a":1,"b":2}');
            console.log(JSON.stringify({ sum: obj.a + obj.b }));
          `,
        },
        mockCtx
      )
      const parsed = JSON.parse((r as any).output || "{}")
      assert(parsed.sum === 3, `expected 3, got ${parsed.sum}`)
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Cleanup & Summary
  // ═══════════════════════════════════════════════════════════════

  fs.rmSync(TMP_DIR, { recursive: true, force: true })

  console.log(`\n${"=".repeat(50)}`)
  console.log(`RESULTS: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log("\nFailures:")
    failures.forEach((f) => console.log(`  ${f}`))
    process.exit(1)
  } else {
    console.log("All smoke tests passed!")
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err)
  process.exit(1)
})
