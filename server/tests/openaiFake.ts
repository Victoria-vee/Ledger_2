import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResult,
} from "../src/services/ai/openaiClient.js";

export function fakeOpenAiClient(
  handler: (
    body: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<ChatCompletionResult>,
): ChatCompletionClient {
  return { chat: { completions: { create: handler } } };
}

export function completionWith(
  content: string,
  finishReason = "stop",
): ChatCompletionResult {
  return {
    choices: [{ finish_reason: finishReason, message: { content } }],
  };
}
