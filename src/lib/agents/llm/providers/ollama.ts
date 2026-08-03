import "server-only";
import { postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type OllamaChatResponse = {
  model: string;
  message: { content: string };
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * Ollama (modèles locaux) — https://github.com/ollama/ollama/blob/main/docs/api.md —
 * aucune clé API : contacte un serveur Ollama local ou distant via
 * `OLLAMA_BASE_URL` (par défaut `http://localhost:11434`). L'absence de
 * serveur qui répond se traduit par une erreur réseau explicite au moment
 * de `complete()`, pas une exception de configuration.
 */
export class OllamaProvider implements LlmProvider {
  readonly key = "ollama";
  readonly defaultModel = "llama3";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = request.model ?? this.defaultModel;

    const data = await postJson<OllamaChatResponse>(
      `${baseUrl.replace(/\/$/, "")}/api/chat`,
      { model, messages: request.messages, stream: false, options: { temperature: request.temperature } },
      {}
    );

    return {
      text: data.message.content,
      provider: this.key,
      model: data.model ?? model,
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
    };
  }
}
