import "server-only";
import { registerEmbeddingProvider, getEmbeddingProvider, listRegisteredEmbeddingProviderKeys } from "./registry";
import { DemoEmbeddingProvider } from "./demo-provider";
import { OpenAiEmbeddingProvider } from "./providers/openai";
import { VoyageAiEmbeddingProvider } from "./providers/voyageai";
import { JinaEmbeddingProvider } from "./providers/jina";
import { CohereEmbeddingProvider } from "./providers/cohere";
import { NomicEmbeddingProvider } from "./providers/nomic";
import { OllamaEmbeddingProvider } from "./providers/ollama";
import { HuggingFaceEmbeddingProvider } from "./providers/huggingface";

let registered = false;

/** Enregistrement idempotent — appelé défensivement par `getActiveEmbeddingProvider` (voir ADR 0013, même précaution que le moteur LLM/le Workflow Engine). */
export function registerBuiltInEmbeddingProviders(): void {
  if (registered) return;
  registered = true;

  registerEmbeddingProvider(new DemoEmbeddingProvider());
  registerEmbeddingProvider(new OpenAiEmbeddingProvider());
  registerEmbeddingProvider(new VoyageAiEmbeddingProvider());
  registerEmbeddingProvider(new JinaEmbeddingProvider());
  registerEmbeddingProvider(new CohereEmbeddingProvider());
  registerEmbeddingProvider(new NomicEmbeddingProvider());
  registerEmbeddingProvider(new OllamaEmbeddingProvider());
  registerEmbeddingProvider(new HuggingFaceEmbeddingProvider());
}

/** Fournisseur actif, piloté par `EMBEDDING_PROVIDER` (défaut `"demo"`) — jamais choisi en dur (même principe que `getActiveLlmProvider`, ADR 0015, réappliqué). */
export function getActiveEmbeddingProvider() {
  registerBuiltInEmbeddingProviders();
  const key = process.env.EMBEDDING_PROVIDER ?? "demo";
  const provider = getEmbeddingProvider(key);
  if (!provider) {
    throw new Error(
      `Fournisseur d'embeddings "${key}" inconnu. Fournisseurs enregistrés : ${listRegisteredEmbeddingProviderKeys().join(", ")}.`
    );
  }
  return provider;
}

export * from "./types";
export * from "./registry";
