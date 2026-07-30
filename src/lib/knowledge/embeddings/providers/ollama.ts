import "server-only";
import { postJson } from "../../http-helpers";
import type { EmbeddingProvider, EmbeddingResult } from "../types";

type OllamaEmbeddingResponse = { embedding: number[] };

/** Ollama (modèles locaux, BGE compris) — pas de clé API, contacte un serveur local/distant via `OLLAMA_BASE_URL`. Un embedding par appel (API Ollama), donc une requête par texte. */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly key = "ollama";
  readonly defaultModel = "nomic-embed-text";

  async embed(texts: string[], model?: string): Promise<EmbeddingResult> {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
    const usedModel = model ?? this.defaultModel;

    const vectors: number[][] = [];
    for (const text of texts) {
      const data = await postJson<OllamaEmbeddingResponse>(`${baseUrl}/api/embeddings`, { model: usedModel, prompt: text }, {});
      vectors.push(data.embedding);
    }

    return { vectors, provider: this.key, model: usedModel, dimensions: vectors[0]?.length ?? 0 };
  }
}
