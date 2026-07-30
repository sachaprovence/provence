import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type VoyageResponse = { data: { embedding: number[] }[]; model: string };

export class VoyageAiEmbeddingProvider implements EmbeddingProvider {
  readonly key = "voyageai";
  readonly defaultModel = "voyage-3";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("VOYAGEAI_API_KEY", "VoyageAI");
    const usedModel = model ?? this.defaultModel;
    const response = await postJson<VoyageResponse>(
      "https://api.voyageai.com/v1/embeddings",
      { model: usedModel, input: texts },
      { Authorization: `Bearer ${apiKey}` }
    );
    const vectors = response.data.map((d) => d.embedding);
    return { vectors, provider: this.key, model: usedModel, dimensions: vectors[0]?.length ?? 0 };
  }
}
