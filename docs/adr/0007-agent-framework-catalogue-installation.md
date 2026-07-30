# ADR 0007 — Agent Framework : catalogue global (`AgentDefinition`) + installation par workspace (`AgentInstallation`)

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La v0.3 doit poser l'infrastructure permettant à des dizaines/centaines
d'agents IA différents de fonctionner de manière uniforme, sans qu'aucun
agent métier ne soit encore codé, et sans dupliquer ce qui existe déjà
(multi-tenant Organization/Workspace de la v0.2, `AIProvider`,
`AuditLog`).

Question centrale : un "agent" est-il une seule entité, ou faut-il
séparer sa **définition** (le programme/capacité) de son **installation**
(l'usage qu'en fait un workspace donné) ?

## Décision

Modèle à deux niveaux, à l'image d'un magasin d'applications :

- **`AgentDefinition`** — le catalogue. Une ligne par *type* d'agent
  (identifiant, nom, description, version, catégorie, icône, schéma de
  configuration, outils qu'il est *capable* d'utiliser, modèles IA
  compatibles, limites par défaut). `organizationId` nullable :
  `null` = agent global fourni par Autorun (catalogue partagé par tous les
  workspaces), non-null = agent propre à une organisation (préparé pour
  des agents "custom" futurs, sans migration supplémentaire). Un
  `runtimeKey` référence l'implémentation TypeScript réelle
  (`src/lib/agents/registry.ts`) — la ligne en base ne contient jamais de
  code exécutable.
- **`AgentInstallation`** — l'usage concret dans **un workspace** :
  référence une `AgentDefinition`, porte son propre statut de cycle de
  vie (installé/actif/inactif/suspendu), sa configuration effective
  (validée contre le schéma de la définition), les outils et permissions
  **réellement accordés** (toujours un sous-ensemble de ce que la
  définition déclare pouvoir utiliser — jamais plus), et ses propres
  limites d'usage. Tout ce qui découle d'un agent (exécutions, mémoire,
  messages, planification) référence une `AgentInstallation`, jamais
  directement une `AgentDefinition` — garantissant l'isolation
  multi-tenant dès le modèle de données.

Les permissions accordées à une installation réutilisent le type
`WorkspacePermission` de la v0.2 (`src/lib/workspace-permissions.ts`)
plutôt que d'inventer un second système de permissions parallèle.

## Conséquences

- Ajouter un nouvel agent = ajouter une ligne `AgentDefinition` +
  enregistrer son runtime dans `src/lib/agents/registry.ts` — jamais de
  nouvelle table, jamais de nouvelle route.
- Un même agent peut être installé dans plusieurs workspaces avec des
  configurations et permissions différentes, sans dupliquer sa définition.
- L'isolation multi-tenant des données produites par un agent est
  garantie par construction : toute requête sur `AgentRun`,
  `AgentMemoryEntry`, `AgentMessage` passe par `AgentInstallation.workspaceId`
  / `organizationId`, filtré comme n'importe quelle autre ressource de
  workspace (voir ADR 0005).
- Réutilisation de `WorkspacePermission` : pas de nouvelle notion de
  permission à maintenir en parallèle de celle de la v0.2.

## Alternatives écartées

- **Un agent = une seule entité globale, sans installation par
  workspace** : écartée — ne permettrait pas des configurations/
  permissions différentes par client, et rendrait l'isolation
  multi-tenant des exécutions/mémoire/messages d'un agent beaucoup plus
  fragile (il faudrait re-scoper chaque table par workspace
  individuellement au lieu d'hériter de `AgentInstallation`).
- **Un système de permissions propre aux agents, indépendant de
  `WorkspacePermission`** : écartée — duplication inutile, contraire à la
  consigne explicite de ne pas dupliquer de code/concept déjà existant.
