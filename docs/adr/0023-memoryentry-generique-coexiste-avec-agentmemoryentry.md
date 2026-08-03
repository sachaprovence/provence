# ADR 0023 — `MemoryEntry` générique (v0.7) coexiste avec `AgentMemoryEntry` (v0.3), sans migration

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le Framework des Agents (v0.3) possède déjà un mécanisme de mémoire :
`AgentMemoryEntry` (`src/lib/agents/memory.ts`, portée
`PERSISTENT`/`EPHEMERAL`, clé libre par installation/workspace), utilisé
tel quel par l'Agent Director (v0.4, `director/memory-helpers.ts`) et
l'Agent Commercial (v0.5, `commercial/memory.ts`). Le brief v0.7 demande un
Memory Engine avec des niveaux bien plus riches (utilisateur, organisation,
workspace, agent, workflow, conversation, tâche, et une nature — long
terme, temporaire, décisionnelle, documentaire, préférences), avec TTL,
expiration, archivage, compression, résumé automatique, historique et
versionnage — un modèle de données incompatible avec `AgentMemoryEntry`
sans réécriture.

C'est exactement la même tension déjà rencontrée et déjà tranchée deux
fois dans ce projet : v0.5 (moteur LLM générique vs `AIProvider` existant
de Provence 360, ADR 0015) et v0.6 (Workflow Engine vs `AutomationRule`
existant, ADR 0022).

## Décision

- `AgentMemoryEntry`/`src/lib/agents/memory.ts` **ne sont ni supprimés ni
  migrés** : Director et Commercial continuent de les utiliser exactement
  comme avant, sans aucune modification de comportement.
- `MemoryEntry` (nouveau modèle Prisma, `src/lib/memory/memory-engine.ts`)
  est le Memory Engine générique demandé par le brief v0.7 — c'est la
  couche que **tout nouveau code** doit utiliser désormais, en particulier
  le Context Engine (voir ADR 0029).
- Les deux modèles coexistent délibérément : `AgentMemoryEntry` reste un
  mécanisme de mémoire *interne* à un runtime d'agent précis (clé libre,
  portée installation), tandis que `MemoryEntry` est une mémoire
  *transversale* (niveaux formalisés, versionnée, avec cycle de vie
  complet) consultable par le Context Engine indépendamment de l'agent qui
  l'a écrite.

## Conséquences

- Zéro risque de régression sur Director/Commercial : leur mémoire
  qualitative (objections, préférences par prospect, contexte de
  délégation) n'est pas touchée.
- Le Context Engine (ADR 0029) ne lit que `MemoryEntry`, jamais
  `AgentMemoryEntry` : la mémoire interne de Director/Commercial n'est
  donc pas automatiquement injectée dans le contexte assemblé pour un
  appel IA tant qu'un futur travail ne la fait pas migrer ou dupliquer
  vers `MemoryEntry` — limitation connue, documentée aussi dans ADR 0029.
- Deux mécanismes de mémoire à comprendre pour quiconque explore le code
  (`agents/memory.ts` et `memory/memory-engine.ts`) — accepté comme coût
  transitoire, comme pour les précédents de v0.5/v0.6.

## Alternatives écartées

- **Migrer `AgentMemoryEntry` vers `MemoryEntry` immédiatement** : écartée
  — casserait potentiellement Director/Commercial sans bénéfice pour le
  périmètre "créer le Memory Engine" de cette version, et demanderait de
  redéfinir la portée `AGENT` (aujourd'hui `installationId`) en cohérence
  avec les 7 `MemoryScopeType` du nouveau modèle.
- **Un seul modèle dès le départ, avec Director/Commercial réécrits pour
  s'en servir** : écartée pour la même raison que ADR 0015/0022 — hors
  périmètre de "créer" un moteur, et risque de régression sur un système
  déjà testé et validé.
