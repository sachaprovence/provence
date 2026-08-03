import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type OpenAiEmbeddingResponse = { data: { embedding: number[] }[]; model: string };

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly key = "openai";
  readonly defaultModel = "text-embedding-3-small";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("OPENAI_API_KEY", "OpenAI (embeddings)");
    const usedModel = model ?? this.defaultModel;
    const response = await postJson<OpenAiEmbeddingResponse>(
      "https://api.openai.com/v1/embeddings",
      { model: usedModel, input: texts },
      { Authorization: `Bearer ${apiKey}` }
    );
    const vectors = response.data.map((d) => d.embedding);
    return { vectors, provider: this.key, model: usedModel, dimensions: vectors[0]?.length ?? 0 };
  }
}
