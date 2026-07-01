import OpenAI from "openai"
import type { KamiToolCall } from "../types"
import type { ProviderInput, ProviderOutput } from "./types"

const parseToolCallArgs = (value: string | undefined) => {
  if (!value) {
    return {}
  }

  try {
    return JSON.parse(value)
  } catch {
    return { raw: value }
  }
}

const mockResponse = (input: ProviderInput): ProviderOutput => {
  const last = [...input.messages].reverse().find((msg) => msg.role === "user")
  const content = last?.content ?? ""

  return {
    text: `KAMI mock response: ${content}`,
    reasoning: "Mock LLM enabled by KAMI_TEST_MOCK_LLM.",
    toolCalls: [],
    usage: {
      prompt_tokens: content.length,
      completion_tokens: content.length,
      total_tokens: content.length * 2,
    },
  }
}

export const completeWithDeepSeek = async (
  input: ProviderInput
): Promise<ProviderOutput> => {
  if (input.config.mockLlm) {
    return mockResponse(input)
  }

  if (!input.config.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required when KAMI_TEST_MOCK_LLM=false")
  }

  const client = new OpenAI({
    apiKey: input.config.apiKey,
    baseURL: input.config.baseUrl,
    maxRetries: 2,
  })

  const messages = input.messages.map((message) => {
    const providerMessage: Record<string, unknown> = {
      role: message.role,
      content: message.content,
    }

    if (message.tool_call_id) {
      providerMessage.tool_call_id = message.tool_call_id
    }

    if (message.tool_calls?.length) {
      providerMessage.tool_calls = message.tool_calls
    }

    return providerMessage
  })

  const response = await client.chat.completions.create({
    model: input.modelOverride ?? input.config.model,
    messages,
    tools: input.tools,
    tool_choice: "auto",
    stream: false,
    reasoning_effort: input.config.reasoningEffort,
    ...(input.config.thinking
      ? { extra_body: { thinking: { type: "enabled" } } }
      : {}),
  } as any)

  const message = response.choices[0]?.message as any
  const toolCalls: KamiToolCall[] = (message?.tool_calls ?? []).map(
    (call: any) => ({
      id: call.id,
      name: call.function?.name,
      arguments: parseToolCallArgs(call.function?.arguments),
    })
  )

  return {
    text: message?.content ?? "",
    reasoning: message?.reasoning_content,
    toolCalls,
    usage: response.usage as Record<string, unknown> | undefined,
  }
}
