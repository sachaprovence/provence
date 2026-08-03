# ADR 0026 — Sécurité : portée organisation/workspace stricte partout, jamais de confiance aveugle en un `sourceRef` ou un index externe

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 est explicite : "Chaque document doit respecter
organisation, workspace, permissions, rôles, audit... Aucun agent ne doit
pouvoir accéder à un document sans autorisation." Le système
d'intelligence documentaire agrège des données très sensibles (fiches
CRM, devis, conversations, décisions commerciales) à travers quatre
moteurs et plusieurs backends externes potentiels (bases vectorielles,
fournisseurs d'embedding) qui ne connaissent pas nativement le modèle
multi-tenant de Provence 360/Autorun.

## Décision

- **Convention reprise de tout le projet** (Director v0.4, Commercial
  v0.5, Workflow Engine v0.6) : toute lecture est scopée explicitement par
  `organizationId` (+`workspaceId` quand le modèle le supporte), jamais
  par un identifiant seul. Un accès refusé lève toujours `NotFoundError`
  (jamais `ForbiddenError`) — ne pas révéler l'existence d'une ressource
  à qui n'y a pas droit.
- Les parseurs de sources déjà en base (`record-parsers.ts` : CRM, Devis,
  Conversation, Décision, Workflow, Log) ne font **jamais** confiance à un
  `sourceRef` fourni par l'appelant seul : chaque lecture Prisma est
  filtrée par `ctx.organizationId`/`ctx.workspaceId` en plus de l'id.
- La recherche vectorielle (`vector-search.ts`) **re-vérifie** la portée
  après la réponse de la base vectorielle active, même si celle-ci a déjà
  reçu un filtre de portée dans sa requête : un backend externe (Pinecone,
  Qdrant...) reste une donnée non maîtrisée par ce code, jamais une
  autorité d'autorisation en soi.
- L'autorisation d'appeler la couche du tout (rôle/permission de
  l'utilisateur courant) reste la responsabilité de l'appelant (route
  API, via `requireWorkspacePermission`) — aucun des quatre moteurs ne
  fait de vérification de rôle en interne, cohérent avec la convention
  déjà en vigueur pour tous les services de ce projet (Director,
  Commercial, Workflow Engine).

## Conséquences

- Un test dédié (`tests/tenant-isolation/knowledge.test.ts`) vérifie
  qu'aucune recherche, aucune opération d'indexation et aucune entrée de
  mémoire d'une organisation n'est jamais visible depuis une autre.
- Le coût de cette discipline est une vérification redondante dans
  certains chemins (ex. `vectorSearch` re-filtre après un backend qui a
  déjà filtré) — accepté volontairement en défense en profondeur plutôt
  que performance.
- Le chiffrement au repos ("si nécessaire", brief) n'est pas mis en place
  dans cette phase : aucune donnée du Knowledge/Memory Engine n'est plus
  sensible que ce que Provence 360 stocke déjà en clair ailleurs (CRM,
  devis) — cohérent avec l'infrastructure existante, pas une régression.

## Alternatives écartées

- **Faire confiance au filtre de portée envoyé à un backend vectoriel
  externe** : écartée — un backend externe est un système tiers, jamais la
  source de vérité d'une décision d'autorisation dans ce projet.
- **Vérification de permission/rôle à l'intérieur des moteurs
  eux-mêmes** : écartée — romprait la convention déjà établie (permission
  vérifiée par l'appelant/route), et dupliquerait une logique déjà
  centralisée dans `workspace-context.ts`/`workspace-permissions.ts`.
