import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type NomicResponse = { embeddings: number[][] };

export class NomicEmbeddingProvider implements EmbeddingProvider {
  readonly key = "nomic";
  readonly defaultModel = "nomic-embed-text-v1.5";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("NOMIC_API_KEY", "Nomic");
    const usedModel = model ?? this.defaultModel;
    const response = await postJson<NomicResponse>(
      "https://api-atlas.nomic.ai/v1/embedding/text",
      { model: usedModel, texts },
      { Authorization: `Bearer ${apiKey}` }
    );
    return { vectors: response.embeddings, provider: this.key, model: usedModel, dimensions: response.embeddings[0]?.length ?? 0 };
  }
}
