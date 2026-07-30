# ADR 0025 — Aucune extension `pgvector` disponible : adaptateur Postgres natif (Float[] + cosinus applicatif), même limite assumée pour la recherche plein texte

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 demande une architecture RAG complète avec compatibilité
PgVector/Pinecone/Qdrant/Weaviate/Milvus/Chroma/FAISS/LanceDB, "pgvector"
étant implicitement le choix par défaut sans configuration externe. Une
vérification directe de l'environnement (`SELECT * FROM
pg_available_extensions WHERE name='vector';`) confirme qu'**aucune
extension `vector` n'est disponible** dans cette instance PostgreSQL.

## Décision

- L'adaptateur `VectorStore` par défaut, toujours nommé `"pgvector"` (clé
  choisie par défaut de `VECTOR_STORE`), n'utilise **pas** le type
  `vector`/l'opérateur `<=>` de l'extension réelle. Il stocke les
  embeddings directement dans `KnowledgeChunk.embedding` (`Float[]`
  Postgres natif) et calcule la similarité cosinus **côté application**
  (`pgvector-store.ts`), après un filtrage SQL par
  organisation/workspace/document/tag qui réduit déjà l'ensemble de
  candidats.
- Par cohérence, la recherche plein texte (`fulltext-search.ts`) n'utilise
  ni colonne `tsvector` ni index GIN (aucun des deux n'existe dans ce
  schéma) : filtrage SQL par présence d'au moins un mot de la requête
  (`OR`, insensible à la casse), classement par fréquence totale calculé
  côté application.
- Les deux limites sont documentées comme **assumées pour cette phase de
  fondation** : un balayage complet des candidats filtrés (`O(n)`), pas un
  index approximatif ou un index inversé. Le test de performance
  (`tests/knowledge/search-performance.test.ts`) vérifie un volume modeste
  (60 documents) reste sous un budget de temps généreux — ce n'est pas un
  test de charge à grande échelle.

## Conséquences

- Le Knowledge Engine fonctionne "out of the box" sans aucune extension
  ni service externe à installer, cohérent avec le principe "aucun
  fournisseur choisi en dur" du brief (n'importe quel autre backend
  vectoriel reste un changement de variable d'environnement, pas de code).
- Le débit de recherche se dégradera linéairement avec le volume de
  fragments indexés par workspace — acceptable pour une fondation, mais
  une vraie extension `pgvector` (ou un backend externe comme Qdrant/
  Pinecone) devra être adoptée avant une montée en charge significative.
- Un déplacement de document (`moveDocument`) reste immédiatement cohérent
  pour `pgvector` (le filtrage par jointure SQL est toujours à jour) mais
  peut laisser des métadonnées `workspaceId` obsolètes sur un backend
  externe piloté par métadonnées, jusqu'à une réindexation explicite — voir
  le commentaire de `moveDocument` dans `indexing-engine.ts`.

## Alternatives écartées

- **Installer l'extension `pgvector`** : hors de contrôle de cette phase
  (l'extension n'est pas disponible dans l'instance managée utilisée ici)
  — documenté plutôt que contourné silencieusement.
- **Choisir un autre backend par défaut (ex. Qdrant embarqué)** : écartée
  — introduirait une dépendance/service externe non demandée par le brief
  pour un simple choix de valeur par défaut, et casserait le principe
  "fonctionne sans configuration" déjà établi pour le fournisseur LLM/
  embedding "demo".
