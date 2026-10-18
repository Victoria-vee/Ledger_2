import OpenAI from "openai";

export interface ChatCompletionRequest {
  model: string;
  temperature: number;
  max_completion_tokens: number;
  response_format: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
}

export interface ChatCompletionResult {
  choices: Array<{
    finish_reason?: string | null;
    message: { content?: string | null };
  }>;
}

export interface ChatCompletionClient {
  chat: {
    completions: {
      create(
        body: ChatCompletionRequest,
        options?: { signal?: AbortSignal },
      ): Promise<ChatCompletionResult>;
    };
  };
}

export function createGroqClient(apiKey: string): ChatCompletionClient {
  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
    maxRetries: 1,
  }) as unknown as ChatCompletionClient;
}

export function isChatCompletionResult(
  value: unknown,
): value is ChatCompletionResult {
  if (typeof value !== "object" || value === null || !("choices" in value)) {
    return false;
  }
  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }
  const choice: unknown = choices[0];
  return (
    typeof choice === "object" &&
    choice !== null &&
    "message" in choice &&
    typeof choice.message === "object" &&
    choice.message !== null &&
    "content" in choice.message &&
    typeof choice.message.content === "string"
  );
}
