import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type OpenAiCompatibleResponse = {
  model: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** API compatible OpenAI — https://docs.mistral.ai/api — nécessite MISTRAL_API_KEY. */
export class MistralProvider implements LlmProvider {
  readonly key = "mistral";
  readonly defaultModel = "mistral-small-latest";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("MISTRAL_API_KEY", "Mistral");
    const model = request.model ?? this.defaultModel;

    const data = await postJson<OpenAiCompatibleResponse>(
      "https://api.mistral.ai/v1/chat/completions",
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
