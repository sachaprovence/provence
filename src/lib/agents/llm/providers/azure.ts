import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type OpenAiCompatibleResponse = {
  model?: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * Azure OpenAI Service — https://learn.microsoft.com/azure/ai-services/openai —
 * nécessite AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT (ex.
 * `https://mon-ressource.openai.azure.com`) et AZURE_OPENAI_DEPLOYMENT (le nom
 * du déploiement, pas un nom de modèle générique — Azure route par
 * déploiement, pas par `model`).
 */
export class AzureOpenAiProvider implements LlmProvider {
  readonly key = "azure";
  readonly defaultModel = "azure-deployment";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("AZURE_OPENAI_API_KEY", "Azure OpenAI");
    const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT", "Azure OpenAI");
    const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT", "Azure OpenAI");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-01";

    const data = await postJson<OpenAiCompatibleResponse>(
      `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      { messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens },
      { "api-key": apiKey }
    );

    return {
      text: data.choices[0]?.message.content ?? "",
      provider: this.key,
      model: request.model ?? deployment,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }
}
