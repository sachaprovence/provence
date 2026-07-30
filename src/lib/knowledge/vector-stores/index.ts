import "server-only";
import { registerVectorStore, getVectorStore, listRegisteredVectorStoreKeys } from "./registry";
import { PgVectorStore } from "./pgvector-store";
import { PineconeVectorStore } from "./pinecone-store";
import { QdrantVectorStore } from "./qdrant-store";
import { WeaviateVectorStore } from "./weaviate-store";
import { ChromaVectorStore } from "./chroma-store";
import { notYetImplementedVectorStores } from "./not-yet-implemented-stores";

let registered = false;

export function registerBuiltInVectorStores(): void {
  if (registered) return;
  registered = true;

  registerVectorStore(new PgVectorStore());
  registerVectorStore(new PineconeVectorStore());
  registerVectorStore(new QdrantVectorStore());
  registerVectorStore(new WeaviateVectorStore());
  registerVectorStore(new ChromaVectorStore());
  for (const store of notYetImplementedVectorStores) registerVectorStore(store);
}

/** Base vectorielle active, pilotée par `VECTOR_STORE` (défaut `"pgvector"`, le seul fonctionnant sans aucune configuration — voir ADR 0025). */
export function getActiveVectorStore() {
  registerBuiltInVectorStores();
  const key = process.env.VECTOR_STORE ?? "pgvector";
  const store = getVectorStore(key);
  if (!store) {
    throw new Error(`Base vectorielle "${key}" inconnue. Bases enregistrées : ${listRegisteredVectorStoreKeys().join(", ")}.`);
  }
  return store;
}

export * from "./types";
export * from "./registry";
