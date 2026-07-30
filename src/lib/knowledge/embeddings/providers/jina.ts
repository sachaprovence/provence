import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type JinaResponse = { data: { embedding: number[] }[]; model: string };

export class JinaEmbeddingProvider implements EmbeddingProvider {
  readonly key = "jina";
  readonly defaultModel = "jina-embeddings-v3";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("JINA_API_KEY", "Jina AI");
    const usedModel = model ?? this.defaultModel;
    const response = await postJson<JinaResponse>(
      "https://api.jina.ai/v1/embeddings",
      { model: usedModel, input: texts },
      { Authorization: `Bearer ${apiKey}` }
    );
    const vectors = response.data.map((d) => d.embedding);
    return { vectors, provider: this.key, model: usedModel, dimensions: vectors[0]?.length ?? 0 };
  }
}
