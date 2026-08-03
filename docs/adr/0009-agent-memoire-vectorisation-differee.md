# ADR 0009 — Mémoire des agents : trois portées, vectorisation réservée mais non implémentée

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La demande impose une mémoire agent avec portée temporaire, persistante et
partagée, un historique, un contexte, des résumés, et une "vectorisation
future", **sans encore intégrer de fournisseur externe**.

## Décision

Un seul modèle, `AgentMemoryEntry`, avec un champ `scope`
(`SHORT_TERM` | `PERSISTENT` | `SHARED`) plutôt que trois tables
séparées :

- `SHORT_TERM` : expire (`expiresAt` non nul), scopée à une
  `AgentInstallation` — mémoire de travail d'une exécution ou session.
- `PERSISTENT` : n'expire pas, scopée à une `AgentInstallation` —
  historique/contexte/résumés durables d'un agent installé.
- `SHARED` : scopée au **workspace** (`installationId` nul), lisible par
  toute installation de ce workspace — mémoire partagée entre agents.

Un champ `embedding` (`Json?`) est réservé dès maintenant dans le schéma
mais **jamais renseigné par le code de cette phase** — aucune extension
PostgreSQL (`pgvector`), aucun appel à un fournisseur d'embeddings n'est
introduit. La vectorisation réelle est un choix d'implémentation futur
(quel fournisseur, quelle dimension, quel index) qui mérite son propre
ADR le moment venu ; la colonne existe pour éviter une migration
supplémentaire quand ce moment arrivera.

## Conséquences

- Une seule table à interroger pour toute portée de mémoire
  (`src/lib/agents/memory.ts` expose `getMemory`/`setMemory`/`listMemory`
  paramétrés par `scope`), pas de duplication de logique entre trois
  tables presque identiques.
- "Historique/contexte/résumés" ne sont pas des concepts séparés en base :
  ce sont des **clés** dans `AgentMemoryEntry` (ex. `key: "context"`,
  `key: "summary"`, ou une clé par tour de conversation) — convention
  documentée dans `src/lib/agents/memory.ts`, pas contrainte au niveau du
  schéma pour rester adaptable à des centaines d'agents aux besoins
  différents.
- Aucun coût, aucune dépendance, aucune clé API n'est requis pour que le
  framework fonctionne en mode démo — cohérent avec le principe déjà
  établi pour `AIProvider`/`EmailProvider`.

## Alternatives écartées

- **Trois tables séparées (mémoire courte, longue, partagée)** : écartée —
  duplication de structure et de requêtes pour un bénéfice de lisibilité
  marginal ; un champ `scope` discriminant suffit et simplifie
  l'évolution future (ajouter une portée ne demande pas de nouvelle
  table).
- **Intégrer un fournisseur de vectorisation dès maintenant** : écartée —
  hors périmètre explicite de cette phase (infrastructure uniquement, pas
  de fournisseur externe), et prématuré sans agent métier réel pour en
  justifier le choix (quel modèle d'embedding, quelle dimension).
