import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type OpenAiChatResponse = {
  model: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** https://platform.openai.com/docs/api-reference/chat — nécessite OPENAI_API_KEY. */
export class OpenAiProvider implements LlmProvider {
  readonly key = "openai";
  readonly defaultModel = "gpt-4o-mini";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("OPENAI_API_KEY", "OpenAI");
    const model = request.model ?? this.defaultModel;

    const data = await postJson<OpenAiChatResponse>(
      "https://api.openai.com/v1/chat/completions",
      { model, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens },
      { Authorization: `Bearer ${apiKey}` }
    );

    return {
      text: data.choices[0]?.message.content ?? "",
      provider: this.key,
      model: data.model ?? model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }
}
