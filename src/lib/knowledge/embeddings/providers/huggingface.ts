import "server-only";
import { requireEnv, postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

/** API d'inférence Hugging Face (couvre aussi les modèles BGE hébergés, ex. `BAAI/bge-m3`, via `model`). Suppose un pipeline "feature-extraction" renvoyant directement un vecteur par entrée. */
export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  readonly key = "huggingface";
  readonly defaultModel = "BAAI/bge-m3";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const apiKey = requireEnv("HUGGINGFACE_API_KEY", "Hugging Face");
    const usedModel = model ?? this.defaultModel;
    const vectors = await postJson<number[][]>(
      `https://api-inference.huggingface.co/models/${usedModel}`,
      { inputs: texts, options: { wait_for_model: true } },
      { Authorization: `Bearer ${apiKey}` }
    );
    return { vectors, provider: this.key, model: usedModel, dimensions: vectors[0]?.length ?? 0 };
  }
}
