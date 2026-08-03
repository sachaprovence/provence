import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type CohereResponse = { embeddings: number[][] };

export class CohereEmbeddingProvider implements EmbeddingProvider {
  readonly key = "cohere";
  readonly defaultModel = "embed-multilingual-v3.0";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("COHERE_API_KEY", "Cohere");
    const usedModel = model ?? this.defaultModel;
    const response = await postJson<CohereResponse>(
      "https://api.cohere.ai/v1/embed",
      { model: usedModel, texts, input_type: "search_document" },
      { Authorization: `Bearer ${apiKey}` }
    );
    return { vectors: response.embeddings, provider: this.key, model: usedModel, dimensions: response.embeddings[0]?.length ?? 0 };
  }
}
