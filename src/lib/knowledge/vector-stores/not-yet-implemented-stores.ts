import "server-only";
import type { VectorStore } from "./types";

/**
 * Bases vectorielles déclarées au registre (visibles, sélectionnables via
 * `VECTOR_STORE`) mais dont l'implémentation réelle est hors périmètre de
 * cette phase — même principe honnête que les placeholders du Framework
 * des Agents (v0.3) et les actions non implémentées du Workflow Engine
 * (v0.6, voir ADR 0022) : plutôt que de simuler un faux succès, chaque
 * appel échoue explicitement. Voir ADR 0025 pour la justification précise
 * par base :
 *
 * - **Milvus** : l'intégration de référence est gRPC (protobuf), pas une
 *   API REST simple comme Pinecone/Qdrant/Chroma — un vrai client
 *   nécessiterait soit une dépendance protobuf/gRPC, soit de réécrire le
 *   protocole à la main. Milvus expose bien une passerelle REST
 *   (Milvus/Zilliz Cloud), mais son contrat diffère significativement
 *   selon la version déployée — hors périmètre sans instance de
 *   référence à valider.
 * - **FAISS** : bibliothèque embarquée (C++/Python), pas un serveur —
 *   aucune API réseau à appeler depuis Node/TypeScript sans binding natif.
 * - **LanceDB** : même limite que FAISS (bibliothèque embarquée, pas de
 *   serveur HTTP par défaut).
 */
function notYetImplemented(key: string): VectorStore {
  return {
    key,
    async upsert() {
      throw new Error(
        `La base vectorielle "${key}" est déclarée au registre mais son implémentation n'est pas encore développée.`
      );
    },
    async delete() {
      throw new Error(
        `La base vectorielle "${key}" est déclarée au registre mais son implémentation n'est pas encore développée.`
      );
    },
    async query() {
      throw new Error(
        `La base vectorielle "${key}" est déclarée au registre mais son implémentation n'est pas encore développée.`
      );
    },
  };
}

export const notYetImplementedVectorStores: VectorStore[] = [
  notYetImplemented("milvus"),
  notYetImplemented("faiss"),
  notYetImplemented("lancedb"),
];
