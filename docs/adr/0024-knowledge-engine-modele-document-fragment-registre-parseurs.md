# ADR 0024 — Knowledge Engine : `KnowledgeDocument`/`KnowledgeChunk` et pipeline d'ingestion par registre de parseurs

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 demande une "véritable base de connaissances" capable
d'indexer 19 types de sources hétérogènes (PDF, Word, Excel, PowerPoint,
Markdown, HTML, Email, Note, CRM, Devis, Facture, Conversation, Log,
Décision, Workflow, Documentation, Image, Audio, Vidéo), avec un "pipeline
d'ingestion extensible". Certaines de ces sources sont des fichiers à
parser, d'autres sont déjà des enregistrements Prisma existants (CRM,
Devis, Conversation, Décision, Workflow, Log) qu'il faut sérialiser en
texte plutôt que "parser".

## Décision

- Deux modèles séparent le document logique de ses fragments indexables :
  `KnowledgeDocument` (titre, contenu textuel complet, métadonnées, tags,
  `checksum`, statut de cycle de vie) et `KnowledgeChunk` (fragment,
  `chunkIndex`, `embedding: Float[]`, `embeddingModel`). Un document a
  toujours son contenu textuel complet stocké (`content`), pas seulement
  ses fragments — nécessaire pour `reindexDocument` (ADR "réindexation
  complète", voir aussi la documentation de `indexing-engine.ts`) sans
  devoir re-parser la source d'origine.
- Le pipeline d'ingestion est un registre `DocumentParser` (un par
  `KnowledgeSourceType`, `src/lib/knowledge/parsers/registry.ts`), même
  patron que les registres déjà établis (fournisseurs LLM v0.5, actions de
  workflow v0.6). Chaque parseur a la même interface
  (`parse(input, ctx) -> {title, content, metadata}`) qu'il s'agisse d'un
  contenu brut passé en paramètre (Markdown/Note/Email/Documentation/HTML)
  ou d'un enregistrement Prisma existant à sérialiser (CRM/Devis/
  Conversation/Décision/Workflow/Log, voir `record-parsers.ts`) —
  l'indexation ne distingue jamais les deux cas.
- Un `sourceRef` optionnel donne une identité stable à un document
  ("même document que la dernière fois") via la contrainte unique
  `(workspaceId, sourceType, sourceRef)`, condition du calcul d'ajout vs
  mise à jour dans `indexing-engine.ts`.

## Conséquences

- Ajouter une nouvelle source de connaissance ne modifie jamais
  `indexing-engine.ts` : un nouveau `DocumentParser` enregistré suffit.
- Le contenu textuel complet étant toujours conservé, une réindexation
  (ex. après changement de fournisseur d'embedding) ne nécessite jamais de
  ré-accéder à la source d'origine (fichier, enregistrement CRM...).
- Chaque parseur de source DB doit systématiquement re-scoper sa lecture
  par `organizationId`/`workspaceId` — jamais faire confiance à
  `sourceRef` seul (voir ADR 0026, sécurité).

## Alternatives écartées

- **Un seul modèle `KnowledgeDocument` avec le contenu déjà découpé en
  tableau JSON** : écartée — empêche l'indexation vectorielle par
  fragment individuel (`KnowledgeChunk.embedding`) et la pagination fine
  des résultats de recherche.
- **Parser à la volée sans stocker le contenu textuel complet** : écartée
  — rendrait `reindexDocument` dépendant de la disponibilité continue de
  la source d'origine, ce qui n'est pas garanti (un email peut disparaître
  de la boîte, un fichier peut être déplacé).
