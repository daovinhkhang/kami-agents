/**
 * KAMI — End-to-end DeepSeek verification (Phase 1, item 3).
 *
 * Runs a REAL DeepSeek turn (KAMI_TEST_MOCK_LLM must be false) through the
 * actual agent loop, asks the model to call a MUTATING commerce tool
 * (create_customer) so the superuser executor (ctx.executor.runWorkflow) is
 * exercised against a real core-flows workflow, then verifies:
 *   - the turn completes (done) with no error,
 *   - a commerce tool was actually invoked,
 *   - the created customer landed in the commerce DB (executor wrote data),
 *   - kami_message + kami_audit_log rows were persisted (real DB writes).
 *
 * Run with:  npm run test:kami-e2e
 */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getKamiConfig, runTurn } from "../kami-runtime"

const COMMERCE_TOOLS = new Set([
  "list_products",
  "get_product",
  "create_product",
  "update_product",
  "delete_product",
  "list_orders",
  "get_order",
  "cancel_order",
  "list_customers",
  "get_customer",
  "create_customer",
  "update_customer",
  "list_inventory",
  "list_price_lists",
  "create_price_list",
  "list_promotions",
  "create_promotion",
  "sales_summary",
])

const collect = async (message: string, container: any, kami: any) => {
  const events: any[] = []

  for await (const event of runTurn(
    { message, source: "api", toolset: "admin" },
    { scope: container, kami }
  )) {
    events.push(event)
  }

  return events
}

const toolCallNames = (events: any[]) =>
  events
    .filter((event) => event.type === "tool_start")
    .map((event) => event.call.name)

export default async function kamiE2eDeepSeek({ container }: any) {
  const config = getKamiConfig()

  if (config.mockLlm) {
    throw new Error(
      "E2E aborted: KAMI_TEST_MOCK_LLM=true. This script verifies the REAL DeepSeek link — set KAMI_TEST_MOCK_LLM=false (or unset) in .env."
    )
  }

  if (!config.apiKey) {
    throw new Error("E2E aborted: DEEPSEEK_API_KEY is missing from .env.")
  }

  const kami = container.resolve("kami")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Unique email so re-runs never collide on Medusa's unique-email constraint.
  const stamp = Date.now()
  const email = `kami-e2e-${stamp}@example.test`
  const firstName = "KAMI"
  const lastName = "E2E Probe"

  const prompt = [
    "You are being verified end-to-end. Do exactly this, in order:",
    `1) Call the create_customer tool with: { "customer": { "email": "${email}", "first_name": "${firstName}", "last_name": "${lastName}" } }.`,
    "2) Then call the finish tool with a one-line confirmation of what you did.",
    "Do not skip step 1. Do not ask any questions.",
  ].join("\n")

  process.stderr.write(`[kami-e2e] turn 1: asking DeepSeek to create customer <${email}>...\n`)

  let events = await collect(prompt, container, kami)
  let calls = toolCallNames(events)

  // Reasoning models occasionally answer without calling the tool. Retry once
  // with a sharper instruction before giving up.
  if (!calls.includes("create_customer")) {
    process.stderr.write("[kami-e2e] create_customer not called on turn 1 — retrying with a sharper prompt...\n")
    events = await collect(
      [
        "You MUST call the create_customer tool now. Do not answer in prose.",
        `Arguments: { "customer": { "email": "${email}", "first_name": "${firstName}", "last_name": "${lastName}" } }.`,
        "Only after the customer is created, call finish.",
      ].join("\n"),
      container,
      kami
    )
    calls = toolCallNames(events)
  }

  const sessionId = events.find((event) => event.type === "session")?.session_id
  const done = events.find((event) => event.type === "done")
  const errorEvent = events.find((event) => event.type === "error")
  const createdCalled = calls.includes("create_customer")
  const commerceCalls = calls.filter((name) => COMMERCE_TOOLS.has(name))

  // --- Hard assertions -------------------------------------------------------
  if (errorEvent) {
    throw new Error(`E2E failed: loop emitted an error event: ${JSON.stringify(errorEvent)}`)
  }

  if (!done) {
    throw new Error("E2E failed: turn did not complete (no 'done' event).")
  }

  if (commerceCalls.length === 0) {
    throw new Error(
      `E2E failed: DeepSeek did not call any commerce tool. calls=${JSON.stringify(calls)}`
    )
  }

  // Did the executor path actually write to the commerce DB?
  const customerResult = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name", "created_at"],
    filters: { email },
    pagination: { take: 5 },
  })
  const customer = customerResult.data?.[0] ?? null
  const customerVerified = !!customer

  if (createdCalled && !customerVerified) {
    throw new Error(
      "E2E failed: create_customer was invoked but no customer row exists in the commerce DB — the executor.runWorkflow path did not persist data."
    )
  }

  // KAMI-side persistence (real DB writes through the loop).
  const messages = await kami.listKamiMessages(
    { session_id: sessionId },
    { take: 50, order: { created_at: "ASC" } }
  )
  const audit = await kami.listKamiAuditLogs(
    { session_id: sessionId },
    { take: 50, order: { created_at: "ASC" } }
  )

  if (messages.length < 2) {
    throw new Error("E2E failed: expected persisted kami_message rows (got < 2).")
  }

  if (audit.length === 0) {
    throw new Error("E2E failed: expected persisted kami_audit_log rows for tool calls.")
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "deepseek (real — KAMI_TEST_MOCK_LLM=false)",
        model: config.model,
        reasoning_effort: config.reasoningEffort,
        thinking: config.thinking,
        session_id: sessionId,
        tool_calls: calls,
        commerce_tool_calls: commerceCalls,
        create_customer_called: createdCalled,
        executor_path_verified: customerVerified,
        customer,
        messages_persisted: messages.length,
        audit_rows: audit.length,
        audit_tools: audit.map((row: any) => row.tool),
        final_text: done?.text ?? null,
      },
      null,
      2
    )
  )
}
