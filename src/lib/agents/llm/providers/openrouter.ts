import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type OpenAiCompatibleResponse = {
  model: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** API compatible OpenAI, routage multi-fournisseurs — https://openrouter.ai/docs — nécessite OPENROUTER_API_KEY. */
export class OpenRouterProvider implements LlmProvider {
  readonly key = "openrouter";
  readonly defaultModel = "openai/gpt-4o-mini";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("OPENROUTER_API_KEY", "OpenRouter");
    const model = request.model ?? this.defaultModel;

    const data = await postJson<OpenAiCompatibleResponse>(
      "https://openrouter.ai/api/v1/chat/completions",
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
