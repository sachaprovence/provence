# Autorun — Backlog

> Backlog exécutable dérivé de `ROADMAP.md`. Chaque tâche porte un
> identifiant unique `AR-NNNN`, numéroté globalement dans l'ordre de
> réalisation prévu. Regroupement par version dans l'ordre où elles doivent
> être livrées — voir `MILESTONES.md` pour les critères de sortie de
> chaque version. **Aucune tâche de ce backlog ne doit être commencée avant
> validation explicite** (cf. consigne : ne pas démarrer le développement).

Légende complexité : Très faible · Faible · Moyenne · Élevée · Très élevée.
Les estimations de temps supposent un développeur senior déjà familier du
code existant, tests inclus.

---

## Version 0.1 — Fondations techniques & DevOps (MOD-00)

> **Statut : ✅ livrée.** AR-0001 à AR-0006 ci-dessous sont implémentées.
> Le développement a révélé un périmètre plus large que prévu pour un socle
> technique "irréprochable" (demande explicite) : validation d'environnement
> (`src/lib/env.ts` + `src/instrumentation.ts`), logger structuré
> (`src/lib/logger.ts`), gestion d'erreurs centralisée (`src/lib/errors.ts`
> + pages `error.tsx`/`global-error.tsx`/`not-found.tsx`), kit de
> composants UI (`src/components/ui/*`) avec système de notifications
> (`ToastProvider`), contrôle de santé (`GET /api/health`) et
> `HEALTHCHECK` Docker. Voir `docs/02-ARCHITECTURE.md` §8 pour le détail
> complet et `docs/adr/0001` à `0004` pour les décisions prises. Ces
> ajouts n'étaient pas détaillés en tâches `AR-NNNN` individuelles dans la
> version initiale de ce backlog ; ils sont documentés ici plutôt que
> numérotés rétroactivement, pour ne pas décaler les identifiants déjà
> référencés par les versions suivantes.

### AR-0001 — Pipeline CI de base
- **Description** : workflow GitHub Actions exécutant lint (ESLint),
  typecheck (`tsc --noEmit`), tests unitaires (Vitest) et build (`next
  build`) sur chaque pull request, avec une base PostgreSQL de service
  éphémère pour les tests nécessitant Prisma.
- **Fichiers concernés** : `.github/workflows/ci.yml` (nouveau).
- **Complexité** : Faible.
- **Estimation** : 0,5 jour.
- **Prérequis** : aucun.
- **Tests nécessaires** : une PR volontairement cassée (erreur ESLint) doit
  faire échouer le pipeline ; une PR valide doit le faire passer.

### AR-0002 — Pipeline e2e sur merge vers `main`
- **Description** : workflow séparé qui, après merge sur `main`, démarre
  l'application + PostgreSQL via `docker compose`, seed la base, puis
  exécute `tests/e2e/golden-path.mjs`.
- **Fichiers concernés** : `.github/workflows/e2e.yml` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0001.
- **Tests nécessaires** : le workflow lui-même constitue le test ; vérifier
  qu'un échec du golden path fait échouer le job (test négatif volontaire).

### AR-0003 — Dossier `docs/adr/` et premier ADR
- **Description** : créer la structure `docs/adr/` avec un gabarit
  (`0000-template.md`) et le premier ADR réel : "monolithe modulaire
  d'abord, extraction en monorepo seulement si nécessaire" (formalise la
  décision déjà prise en §11 de `docs/00-AUTORUN-VISION.md`).
- **Fichiers concernés** : `docs/adr/0000-template.md`,
  `docs/adr/0001-monolithe-modulaire-d-abord.md`.
- **Complexité** : Très faible.
- **Estimation** : 0,25 jour.
- **Prérequis** : aucun.
- **Tests nécessaires** : aucun (documentation).

### AR-0004 — Gabarit de test d'isolation multi-tenant
- **Description** : fonction utilitaire de test réutilisable qui, étant
  donné une route API et deux organisations de test (A et B), vérifie
  qu'un acteur de A ne peut ni lire ni écrire une ressource de B (403/404
  attendu). Appliquée en premier lieu à une route existante
  (`api/leads/[id]`) comme preuve de concept.
- **Fichiers concernés** : `tests/helpers/tenant-isolation.ts` (nouveau),
  `tests/tenant-isolation/leads.test.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0001.
- **Tests nécessaires** : le gabarit est lui-même le test ; vérifier qu'il
  détecte bien une fuite si on désactive volontairement le filtre
  `organizationId` dans une copie de test de la route.

### AR-0005 — `CODEOWNERS` minimal
- **Description** : fichier `CODEOWNERS` basique routant les revues par
  dossier (`src/lib/ai/` → référent IA, `prisma/` → référent données,
  etc.), même en équipe réduite, pour habituer le processus dès le début.
- **Fichiers concernés** : `.github/CODEOWNERS` (nouveau).
- **Complexité** : Très faible.
- **Estimation** : 0,25 jour.
- **Prérequis** : aucun.
- **Tests nécessaires** : aucun.

### AR-0006 — Règle de lint anti-`console.log`
- **Description** : règle ESLint interdisant `console.log`/`console.error`
  bruts dans `src/` hors tests, en préparation de `MOD-16`
  (observabilité), avec liste d'exceptions explicite si besoin transitoire.
- **Fichiers concernés** : `eslint.config.mjs`.
- **Complexité** : Très faible.
- **Estimation** : 0,25 jour.
- **Prérequis** : AR-0001.
- **Tests nécessaires** : la CI doit refuser un `console.log` ajouté
  volontairement dans une PR de test.

**Total estimé v0.1 : ~4 jours.**

---

## Version 0.2 — Multi-tenant Organization/Workspace (MOD-21, remplace le plan initial)

> **Statut : ✅ livrée** (2026-07-29), avec un contenu différent du plan
> initial ci-dessous — voir `ROADMAP.md` §1 bis et `MILESTONES.md` v0.2.
> Les tâches `AR-0007` à `AR-0014` (configuration métier / Vertical Pack)
> n'ont **pas** été traitées dans cette version ; elles restent valables
> et seront reprises dans une version ultérieure. Le travail réellement
> livré pour v0.2 est listé ci-dessous (AR-0067 à AR-0077), suivi du plan
> initial conservé tel quel pour référence future.

### AR-0067 — Modèle `Workspace` + migration additive
- **Description** : nouveau modèle Prisma `Workspace` (`organizationId`,
  `name`, `slug` unique par organisation, `isDefault`, `archivedAt`),
  migration purement additive (aucune table/colonne existante modifiée),
  backfill SQL créant un workspace par défaut pour chaque organisation
  existante.
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/20260729221028_add_workspace_multi_tenant/`.
- **Complexité** : Élevée.
- **Estimation réelle** : 1 jour.
- **Prérequis** : aucun.
- **Tests** : `tests/workspace-migration.test.ts` (invariants post-migration
  sur données réelles).

### AR-0068 — Modèles `WorkspaceMembership` / `WorkspaceRole` / `WorkspaceInvitation`
- **Description** : appartenance à un workspace (8 rôles : Owner, Admin,
  Manager, Commercial, Opérateur, Comptable, Support, Viewer), additive par
  rapport à `Membership`/`MembershipRole` (inchangés) ; invitations avec
  jeton, expiration et statut. Backfill : une `WorkspaceMembership` par
  `Membership` existant, mapping de rôle documenté en ADR 0006.
- **Fichiers concernés** : `prisma/schema.prisma`, même migration que
  AR-0067, `docs/adr/0006-roles-workspace-et-migration-des-roles-existants.md`.
- **Complexité** : Élevée.
- **Estimation réelle** : 1 jour.
- **Prérequis** : AR-0067.
- **Tests** : `tests/workspace-migration.test.ts`,
  `tests/tenant-isolation/workspace-lifecycle.test.ts`.

### AR-0069 — `workspaceId` sur `Lead` + `activeWorkspaceId` sur `Session`
- **Description** : première preuve de concept du scoping par workspace
  sur une table métier existante (`Lead`), et stockage serveur du
  workspace actif de la session (jamais un identifiant de confiance
  fourni par le client).
- **Fichiers concernés** : `prisma/schema.prisma` (même migration).
- **Complexité** : Moyenne.
- **Estimation réelle** : 0,5 jour.
- **Prérequis** : AR-0067.
- **Tests** : `tests/tenant-isolation/workspaces.test.ts`.

### AR-0070 — `src/lib/workspace-permissions.ts` (matrice de permissions)
- **Description** : permissions nommées par rôle de workspace
  (`MANAGE_WORKSPACE`, `MANAGE_MEMBERS`, `MANAGE_LEADS`,
  `VALIDATE_MESSAGES`, `MANAGE_FINANCE`, `EXECUTE_MISSIONS`,
  `VIEW_WORKSPACE`), noms d'action d'audit, libellés d'affichage.
- **Fichiers concernés** : `src/lib/workspace-permissions.ts`.
- **Complexité** : Moyenne.
- **Estimation réelle** : 0,5 jour.
- **Prérequis** : AR-0068.
- **Tests** : `tests/tenant-isolation/workspaces.test.ts`.

### AR-0071 — `src/lib/workspace-context.ts` (résolution serveur du workspace actif)
- **Description** : résolution de l'acteur + son workspace actif,
  toujours revérifiée côté serveur ; changement de workspace actif
  (`setActiveWorkspace`) qui revalide systématiquement la
  `WorkspaceMembership` avant d'écrire, jamais de confiance dans un
  `workspaceId` client ; `requireWorkspacePermission` journalise
  systématiquement un refus avant de lever.
- **Fichiers concernés** : `src/lib/workspace-context.ts`,
  extension additive de `src/lib/auth.ts` (`CurrentActor.sessionId`).
- **Complexité** : Élevée.
- **Estimation réelle** : 1,5 jour.
- **Prérequis** : AR-0069, AR-0070.
- **Tests** : `tests/tenant-isolation/workspaces.test.ts` (falsification,
  accès refusé).

### AR-0072 — `src/lib/workspace-service.ts` (CRUD + cycle de vie)
- **Description** : création/mise à jour/archivage/restauration de
  workspace, invitation/changement de rôle/retrait de membre, acceptation
  d'invitation (création de compte si nécessaire + `Membership`
  d'organisation mappée + `WorkspaceMembership`) ; `resolveWorkspaceOrThrow`
  filtre systématiquement par l'organisation de l'acteur.
- **Fichiers concernés** : `src/lib/workspace-service.ts`,
  `src/lib/validations/workspace.ts`.
- **Complexité** : Très élevée.
- **Estimation réelle** : 2 jours.
- **Prérequis** : AR-0071.
- **Tests** : `tests/tenant-isolation/workspace-lifecycle.test.ts`,
  `tests/tenant-isolation/workspaces.test.ts`.

### AR-0073 — Routes API `/api/workspaces/**` et `/api/workspace-invitations/**`
- **Description** : CRUD workspace, membres, changement de workspace
  actif, consultation/acceptation d'invitation (route publique).
- **Fichiers concernés** : `src/app/api/workspaces/route.ts`,
  `src/app/api/workspaces/[id]/route.ts`,
  `src/app/api/workspaces/[id]/archive/route.ts`,
  `src/app/api/workspaces/[id]/restore/route.ts`,
  `src/app/api/workspaces/[id]/members/route.ts`,
  `src/app/api/workspaces/[id]/members/[membershipId]/route.ts`,
  `src/app/api/workspaces/active/route.ts`,
  `src/app/api/workspace-invitations/[token]/route.ts`, `src/proxy.ts`.
- **Complexité** : Élevée.
- **Estimation réelle** : 1,5 jour.
- **Prérequis** : AR-0072.
- **Tests** : test e2e `tests/e2e/two-organizations-isolation.mjs`
  (falsification d'id via API réelle).

### AR-0074 — UI : sélecteur de workspace, pages de gestion, membres
- **Description** : `WorkspaceSwitcher` dans la barre latérale, page
  `/settings/workspaces` (liste, création, archivage), page
  `/settings/workspaces/[id]/members` (liste, invitation, changement de
  rôle, retrait), page publique `/workspace-invitations/[token]`
  (acceptation).
- **Fichiers concernés** : `src/components/workspace-switcher.tsx`,
  `src/components/workspaces-client.tsx`,
  `src/components/workspace-members-client.tsx`,
  `src/app/(app)/settings/workspaces/page.tsx`,
  `src/app/(app)/settings/workspaces/[id]/members/page.tsx`,
  `src/app/workspace-invitations/[token]/page.tsx`,
  `src/app/(app)/layout.tsx`, `src/components/nav-config.ts`.
- **Complexité** : Élevée.
- **Estimation réelle** : 2 jours.
- **Prérequis** : AR-0073.
- **Tests** : vérification manuelle + golden path e2e en non-régression
  (le layout applicatif est utilisé par toutes les pages existantes).

### AR-0075 — Migration de Provence 360 comme premier workspace + correction du seed
- **Description** : migration des données existantes (16 prospects, 3
  memberships) vers un workspace par défaut, avec mapping de rôle. Bug
  détecté en vérification finale : `prisma/seed.ts` ne créait pas de
  workspace par défaut (seule la route d'inscription le faisait) —
  corrigé.
- **Fichiers concernés** : migration (AR-0067), `prisma/seed.ts`,
  `src/app/api/auth/register/route.ts`.
- **Complexité** : Moyenne.
- **Estimation réelle** : 0,5 jour (dont détection/correction du bug).
- **Prérequis** : AR-0067, AR-0068.
- **Tests** : `tests/workspace-migration.test.ts`,
  `tests/e2e/golden-path.mjs` (non-régression complète).

### AR-0076 — Suite de tests d'isolation multi-tenant (organisation + workspace)
- **Description** : isolation entre deux organisations (existant,
  étendu), isolation entre deux workspaces d'une même organisation, accès
  autorisé/interdit journalisé, falsification d'identifiant, changement de
  rôle, archivage (workspace par défaut protégé), cycle de vie complet.
- **Fichiers concernés** : `tests/tenant-isolation/workspaces.test.ts`,
  `tests/tenant-isolation/workspace-lifecycle.test.ts`,
  `tests/tenant-isolation/leads.test.ts` (mise à jour de type).
- **Complexité** : Élevée.
- **Estimation réelle** : 1,5 jour.
- **Prérequis** : AR-0072.
- **Tests** : ce sont les tests eux-mêmes (29 tests, tous verts contre une
  vraie base PostgreSQL).

### AR-0077 — Test e2e « deux organisations, deux utilisateurs »
- **Description** : script Playwright créant deux organisations, deux
  utilisateurs, un prospect par organisation, et vérifiant qu'aucun ne
  voit les données (nom d'organisation, prospects) de l'autre, y compris
  via tentative directe d'accès API à un id d'une autre organisation.
- **Fichiers concernés** : `tests/e2e/two-organizations-isolation.mjs`,
  `package.json` (script `test:e2e:tenants`).
- **Complexité** : Moyenne.
- **Estimation réelle** : 1 jour.
- **Prérequis** : AR-0073.
- **Tests** : le script lui-même.

**Total estimé du travail réellement livré pour v0.2 : ~13 jours.**

---

### Plan initial de v0.2 (non traité dans cette version, conservé pour référence)

> Les tâches ci-dessous décrivaient la généralisation de la configuration
> métier (`MOD-02`). Elles restent valables et seront reprises dans une
> version ultérieure — non renumérotées par anticipation.

### AR-0007 — Modèle `PipelineStageDefinition`
- **Description** : nouvelle table Prisma représentant une étape de
  pipeline configurable par organisation (clé technique stable, libellé,
  ordre, couleur), sans encore modifier `Lead.stage` (ajout pur, pas de
  retrait).
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/<timestamp>_add_pipeline_stage_definition/`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0004.
- **Tests nécessaires** : test de migration (up puis down) sans perte de
  données existantes.

### AR-0008 — Modèle `LeadCategoryDefinition`
- **Description** : nouvelle table pour les catégories de prospects
  configurables par organisation, en parallèle de l'enum `LeadCategory`
  existant (toujours présent à ce stade).
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0004.
- **Tests nécessaires** : idem AR-0007.

### AR-0009 — Modèle `ServiceCatalogDefinition`
- **Description** : généraliser `Service`/`ServiceKind` vers une
  définition de catalogue par organisation (le modèle `Service` existant
  est conservé, `ServiceKind` devient un champ configurable plutôt qu'un
  enum fermé).
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0004.
- **Tests nécessaires** : idem AR-0007.

### AR-0010 — Script de migration de données Provence 360
- **Description** : script (`prisma/scripts/migrate-vertical-config.ts`)
  qui, pour l'organisation Provence 360 existante, crée automatiquement les
  `PipelineStageDefinition`/`LeadCategoryDefinition`/
  `ServiceCatalogDefinition` correspondant exactement aux valeurs d'enum
  actuelles (aucune perte, aucun changement de libellé visible).
- **Fichiers concernés** : `prisma/scripts/migrate-vertical-config.ts`
  (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0007, AR-0008, AR-0009.
- **Tests nécessaires** : comparaison automatisée avant/après (snapshot des
  valeurs affichées pour Provence 360, doit être identique).

### AR-0011 — Bascule lecture applicative vers la configuration
- **Description** : faire lire à l'application (pages, API, moteurs de
  scoring/séquence) les nouvelles tables de configuration au lieu des
  enums en dur, en gardant les enums en base comme filet de sécurité
  (double écriture temporaire).
- **Fichiers concernés** : `src/lib/labels.ts`, `src/lib/scoring.ts`,
  `src/app/(app)/leads/**`, `src/app/(app)/pipeline/**`,
  `src/components/services-manager.tsx`.
- **Complexité** : Très élevée.
- **Estimation** : 4 jours.
- **Prérequis** : AR-0010.
- **Tests nécessaires** : `tests/e2e/golden-path.mjs` doit continuer à
  passer sans modification ; tests unitaires sur `labels.ts`/`scoring.ts`.

### AR-0012 — UI d'administration de la configuration vertical
- **Description** : étendre les pages `settings/` existantes pour permettre
  la création/édition des étapes de pipeline, catégories et catalogue de
  services depuis l'interface (au lieu d'un accès direct en base).
- **Fichiers concernés** : `src/app/(app)/settings/**`,
  `src/components/services-manager.tsx`,
  `src/components/scoring-rules-editor.tsx`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0011.
- **Tests nécessaires** : test d'édition d'une catégorie via l'UI et
  vérification de sa prise en compte dans le CRM.

### AR-0013 — Vertical par défaut ("generic")
- **Description** : jeu de configuration minimal appliqué automatiquement à
  toute nouvelle organisation qui ne sélectionne pas explicitement
  Provence 360 comme vertical de départ.
- **Fichiers concernés** : `src/lib/bootstrap.ts`,
  `prisma/seed.ts` (ajout d'un second jeu de seed optionnel).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0011.
- **Tests nécessaires** : création d'une organisation sans configuration
  explicite → vérifie qu'elle reçoit un jeu de valeurs cohérent et
  utilisable immédiatement.

### AR-0014 — Retrait des enums métier devenus obsolètes
- **Description** : une fois AR-0011/AR-0012 validés en production sur
  Provence 360 pendant une période d'observation, retirer les enums
  `LeadCategory`/`ServiceKind` désormais redondants avec les tables de
  configuration (migration destructive, à faire en dernier et
  séparément).
- **Fichiers concernés** : `prisma/schema.prisma`, migration de
  suppression.
- **Complexité** : Élevée.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0012, AR-0013, période d'observation en production
  (voir `MILESTONES.md`).
- **Tests nécessaires** : suite complète de non-régression avant
  suppression définitive.

**Total estimé v0.2 : ~14,5 jours.**

---

## Version 0.3 — Framework des Agents IA (MOD-22, remplace le plan initial)

> **Statut : ✅ livrée.** Comme pour v0.2, le plan initial de v0.3
> (validation par un 2ᵉ vertical fictif, `MOD-20`) a été remplacé sur
> demande explicite par un module jugé plus urgent : le Framework des
> Agents IA (`MOD-22`), infrastructure commune requise par tout agent
> métier futur. Aucun agent métier (Commercial, CRM, Marketing,
> Comptabilité, Support, Analyse, Directeur) n'est développé dans cette
> version — uniquement leur infrastructure. Le plan initial (AR-0015 à
> AR-0021) est conservé ci-dessous pour référence, reporté après v0.3.

### AR-0078 — Schéma Prisma du Framework des Agents (définitions, installations, outils, runs, mémoire, messages, interventions, planifications)
- **Description** : migration additive créant les enums et modèles du
  Framework des Agents : `AgentDefinition`, `AgentInstallation`,
  `AgentTool`, `AgentRun`, `AgentRunLog`, `AgentMemoryEntry`,
  `AgentMessage`, `AgentInterventionRequest`, `AgentSchedule`, ainsi que le
  champ nullable `AIRequest.agentRunId` pour l'agrégation future du coût
  IA. Purement additive (aucune suppression/modification de structure
  existante).
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/20260730065504_add_agent_framework/`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0067 (modèle `Workspace`, v0.2).
- **Tests nécessaires** : migration appliquée sans perte de donnée sur la
  base existante ; tests d'isolation multi-tenant (voir AR-0084).

### AR-0079 — Registres en mémoire (runtimes d'agent, gestionnaires d'outil)
- **Description** : `src/lib/agents/registry.ts` et
  `src/lib/agents/tool-registry.ts` — deux registres `Map` idempotents
  (`registerAgentRuntime`/`registerToolHandler`), peuplés une fois au
  démarrage du serveur (`src/instrumentation.ts`), survivant au HMR
  Turbopack.
- **Fichiers concernés** : `src/lib/agents/registry.ts`,
  `src/lib/agents/tool-registry.ts`, `src/lib/agents/types.ts`,
  `src/instrumentation.ts`.
- **Complexité** : Faible.
- **Estimation** : 0,5 jour.
- **Prérequis** : AR-0078.

### AR-0080 — Permissions du Framework des Agents (plafond, vérification serveur)
- **Description** : `src/lib/agents/permissions.ts` —
  `assertGrantsWithinDeclaredCeiling` (les droits accordés à une
  installation restent toujours un sous-ensemble de ce que la définition
  déclare ET de ce que le rôle de l'acteur humain autorise, réutilise
  `WorkspacePermission` de v0.2 sans système parallèle),
  `requireAgentToolPermission`/`requireAgentWorkspacePermission` (audit-
  logués en cas de refus).
- **Fichiers concernés** : `src/lib/agents/permissions.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0079, AR-0070 (matrice de permissions de workspace,
  v0.2).
- **Tests nécessaires** : refus d'un outil non déclaré, refus d'une
  permission dépassant le rôle réel de l'acteur.

### AR-0081 — Cycle de vie des installations d'agent
- **Description** : `src/lib/agents/installation-service.ts` — catalogue,
  installation (plafond de droits), mise à jour des droits/config,
  transitions de statut complètes (installé, actif, inactif, suspendu,
  désinstallé) avec table de transitions autorisées, audit systématique de
  chaque action.
- **Fichiers concernés** : `src/lib/agents/installation-service.ts`,
  `src/lib/validations/agent.ts`,
  `src/app/api/agents/catalog/route.ts`,
  `src/app/api/agents/installations/**`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0080.
- **Tests nécessaires** : voir `tests/agents/installation-lifecycle.test.ts`
  (installation plafonnée, refus d'excès d'outil/permission, refus de
  double installation, cycle de vie complet valide/invalide).

### AR-0082 — Moteur d'exécution (file interne, priorités, timeout, reprises)
- **Description** : `src/lib/agents/execution-engine.ts` — création de
  runs, file d'attente interne PostgreSQL (mêmes principes que
  `sequence-engine.ts`), priorités, `withTimeout`, reprises automatiques
  avec compteur de tentatives, annulation, journal (`AgentRunLog`), route
  cron `POST /api/cron/process-agent-runs`.
- **Fichiers concernés** : `src/lib/agents/execution-engine.ts`,
  `src/app/api/cron/process-agent-runs/route.ts`,
  `src/app/api/agents/runs/**`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0081.
- **Tests nécessaires** : voir `tests/agents/execution-engine.test.ts`
  (succès de bout en bout, refus d'outil non accordé, timeout, reprise
  puis échec définitif, annulation, refus si installation non active).

### AR-0083 — Mémoire, communication et scheduler des agents
- **Description** : `src/lib/agents/memory.ts` (portées temporaire/
  persistante/partagée, TTL, champ `embedding` réservé pour vectorisation
  future), `src/lib/agents/messaging.ts` (messages historisés, demandes
  d'intervention humaine), `src/lib/agents/scheduler.ts` (tâches
  ponctuelles, récurrentes, événementielles), route cron
  `POST /api/cron/process-agent-schedules`.
- **Fichiers concernés** : `src/lib/agents/memory.ts`,
  `src/lib/agents/messaging.ts`, `src/lib/agents/scheduler.ts`,
  `src/app/api/cron/process-agent-schedules/route.ts`,
  `src/app/api/agents/installations/[id]/memory/route.ts`,
  `src/app/api/agents/installations/[id]/messages/route.ts`,
  `src/app/api/agents/installations/[id]/schedules/route.ts`,
  `src/app/api/agents/interventions/**`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0082.
- **Tests nécessaires** : voir
  `tests/agents/memory-messaging-scheduler.test.ts`.

### AR-0084 — Outils déclaratifs, agent de diagnostic, bootstrap, observabilité
- **Description** : `src/lib/agents/tools/*` (outils système, CRM,
  gabarits d'outils non encore implémentés), `src/lib/agents/bootstrap.ts`
  (registre unique d'outils + synchronisation du catalogue, sans `upsert`
  sur clé composite nullable), `src/lib/agents/definitions/
  diagnostic-agent.ts` (seul « agent » livré dans cette version — un
  runtime de diagnostic non métier servant à valider le framework de bout
  en bout), `src/lib/agents/observability.ts` (statistiques d'exécution,
  coût IA agrégé via `AIRequest.agentRunId`).
- **Fichiers concernés** : `src/lib/agents/tools/**`,
  `src/lib/agents/bootstrap.ts`, `src/lib/agents/definitions/
  diagnostic-agent.ts`, `src/lib/agents/observability.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0083.
- **Tests nécessaires** : voir `tests/tenant-isolation/agents.test.ts`
  (isolation multi-tenant complète : installations, runs, mémoire,
  messages).

### AR-0085 — Interface d'administration des agents
- **Description** : `/settings/agents` (liste du catalogue + installations
  du workspace actif) et `/settings/agents/[id]` (détail : configuration,
  permissions, outils accordés, statistiques, historique des runs,
  journaux), réservée aux rôles Owner/Admin.
- **Fichiers concernés** :
  `src/app/(app)/settings/agents/page.tsx`,
  `src/app/(app)/settings/agents/[id]/page.tsx`,
  `src/components/agents-client.tsx`,
  `src/components/agent-detail-client.tsx`,
  `src/components/nav-config.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0084.
- **Tests nécessaires** : vérification manuelle des permissions d'accès
  (rôle Owner/Admin uniquement).

**Total estimé du travail réellement livré pour v0.3 : ~13,5 jours.**

---

### Plan initial de v0.3 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0015` à `AR-0021` (validation par un 2ᵉ vertical fictif)
> ci-dessous n'ont pas été traitées dans cette version — voir
> `ROADMAP.md` §1 ter. Reportées après v0.3.

### AR-0015 — Définition du vertical fictif de test
- **Description** : créer un jeu de configuration complet pour un métier
  fictif distinct (ex. "Cabinet de conseil RH") : catégories, catalogue de
  services, gabarits de message, règles de scoring par défaut — uniquement
  via les outils créés en v0.2, aucune ligne de code métier.
- **Fichiers concernés** : `prisma/seed-vertical-fictif.ts` (nouveau),
  aucun fichier applicatif si l'objectif est atteint.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0012, AR-0013.
- **Tests nécessaires** : le golden path rejoué avec ce vertical (nouveau
  script e2e `tests/e2e/golden-path-vertical-fictif.mjs`).

### AR-0016 — Correctifs suite à la validation
- **Description** : tâche "tampon" — corriger les lacunes de généralisation
  révélées par AR-0015 (champs encore codés en dur découverts en
  pratique). Portée réelle connue seulement après AR-0015 ; estimation
  provisoire.
- **Fichiers concernés** : variable selon les lacunes trouvées.
- **Complexité** : Moyenne (à confirmer après AR-0015).
- **Estimation** : 2 jours (provision).
- **Prérequis** : AR-0015.
- **Tests nécessaires** : golden path des deux verticaux en non-régression.

### AR-0017 — Champs personnalisés par vertical (MOD-03)
- **Description** : ajouter un champ `customFields: Json` validé
  dynamiquement (schéma Zod généré depuis la définition de champs du
  vertical) sur `Lead`, pour couvrir les attributs propres à un métier sans
  migration Prisma à chaque nouveau vertical.
- **Fichiers concernés** : `prisma/schema.prisma`,
  `src/lib/validations/lead.ts`, `src/app/(app)/leads/[id]/**`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0015.
- **Tests nécessaires** : validation Zod dynamique testée avec deux jeux de
  champs différents (Provence 360 vs vertical fictif).

### AR-0018 — Gabarits de message résolus par vertical (MOD-05)
- **Description** : `templateKey` de `SequenceStep` résolu depuis la
  configuration du vertical de l'organisation plutôt que codé en dur ;
  échec explicite si un gabarit référencé n'existe pas pour le vertical
  courant.
- **Fichiers concernés** : `src/lib/sequence-engine.ts`,
  `src/components/sequence-builder.tsx`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0015.
- **Tests nécessaires** : test qu'un gabarit inconnu échoue explicitement
  (pas de repli silencieux vers un gabarit Provence 360).

### AR-0019 — Registre de déclencheurs/actions extensible (MOD-09)
- **Description** : généraliser `automation-engine.ts` avec un registre de
  types de déclencheur/action validés par schéma Zod dédié, permettant
  d'ajouter une règle propre au vertical fictif sans modifier le moteur.
- **Fichiers concernés** : `src/lib/automation-engine.ts`,
  `src/lib/validations/automation-rule.ts` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0015.
- **Tests nécessaires** : test des 7 règles Provence 360 existantes en
  non-régression + une règle nouvelle pour le vertical fictif.

### AR-0020 — Détection de boucle sur les règles d'automatisation
- **Description** : garde-fou empêchant une règle de se déclencher
  elle-même en cascade (limite de nombre d'exécutions par règle par jour).
- **Fichiers concernés** : `src/lib/automation-engine.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0019.
- **Tests nécessaires** : test qui construit délibérément une règle
  cyclique et vérifie qu'elle est coupée après N exécutions.

### AR-0021 — Filtres dashboard dynamiques (MOD-11)
- **Description** : `stats.ts` et les pages `stats/`/`dashboard/` lisent
  les catégories/services depuis la configuration au lieu des enums fixes.
- **Fichiers concernés** : `src/lib/stats.ts`,
  `src/app/(app)/stats/**`, `src/app/(app)/dashboard/**`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0011.
- **Tests nécessaires** : test de cohérence des agrégats sur le vertical
  fictif.

**Total estimé v0.3 : ~12 jours.**

---

## Version 0.4 — Agent Director (MOD-23, remplace le plan initial)

> **Statut : ✅ livrée.** Comme pour v0.2/v0.3, le plan initial de v0.4
> (facturation client final, socle — `MOD-12` partie 1) a été remplacé sur
> demande explicite par un module jugé plus urgent : le premier agent réel
> d'Autorun, un orchestrateur (l'Agent Director) construit intégralement
> sur le Framework des Agents (v0.3), sans aucun contournement. Aucun
> agent métier n'est développé dans cette version — le Director ne réalise
> jamais lui-même de tâche métier. Le plan initial (AR-0022 à AR-0026) est
> conservé ci-dessous pour référence, reporté après v0.4.

### AR-0086 — Schéma Prisma `AgentPlan`/`AgentPlanStep` + valeur d'enum `AGENT`
- **Description** : migration additive — deux nouveaux modèles (plan
  d'exécution multi-étapes, DAG de dépendances par référence vers un index
  antérieur), et une nouvelle valeur `AGENT` sur `AgentRunTrigger` (un run
  créé par délégation, distinct de `MANUAL`/`SCHEDULED`/`EVENT`/`API`).
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/20260730074938_add_agent_director/`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0078 (schéma du Framework des Agents, v0.3).
- **Tests nécessaires** : migration purement additive, vérifiée sans perte
  de donnée ; validation du DAG (voir AR-0087).

### AR-0087 — Moteur de planification (`planning-engine.ts`)
- **Description** : `createPlan` (validation du DAG à la création — une
  étape ne peut dépendre que d'un index strictement antérieur, ce qui
  exclut tout cycle), `getReadySteps` (dépendances toutes `SUCCEEDED`,
  propagation en cascade des échecs vers `SKIPPED`), `mergePlanResults`.
- **Fichiers concernés** : `src/lib/agents/director/planning-engine.ts`.
- **Complexité** : Élevée.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0086.
- **Tests nécessaires** : voir `tests/agents/director-planning.test.ts`.

### AR-0088 — Moteur de délégation + outils `director.*`
- **Description** : `delegation-engine.ts` (appeler/attendre un agent de
  façon synchrone intra-processus — voir ADR 0010 —, annuler, relancer
  avec lignée via `AgentRun.parentRunId`), exposé au runtime du Director
  exclusivement via 4 outils du registre (`director.list_agents`,
  `director.delegate_task`, `director.cancel_task`, `director.retry_task`)
  pour que chaque délégation passe par la vérification de permission
  standard du Framework.
- **Fichiers concernés** : `src/lib/agents/director/delegation-engine.ts`,
  `src/lib/agents/tools/director-tools.ts`,
  `src/lib/agents/types.ts` (contexte d'outil étendu avec `run`).
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0087.
- **Tests nécessaires** : voir `tests/agents/director-delegation.test.ts`
  (délégation réussie, parallèle, séquentielle, erreur, timeout, relance,
  annulation, permissions manquantes, cloisonnement entre orchestrateurs).

### AR-0089 — Décomposition heuristique de l'objectif + runtime du Director
- **Description** : `decomposition.ts` (correspondance de mots-clés,
  explicitement pas une compréhension du langage naturel — voir ADR 0011)
  et `definitions/director-agent.ts` (le runtime `director.orchestrator` :
  reçoit, comprend, décompose, planifie, délègue, attend, fusionne,
  vérifie la cohérence globale, gère les erreurs, produit une réponse
  finale).
- **Fichiers concernés** : `src/lib/agents/director/decomposition.ts`,
  `src/lib/agents/definitions/director-agent.ts`,
  `src/lib/validations/director.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0088.
- **Tests nécessaires** : voir `tests/agents/director-delegation.test.ts`
  et `tests/agents/director-planning.test.ts`.

### AR-0090 — Mémoire du Director
- **Description** : `memory-helpers.ts` — conversation (liste plafonnée),
  décisions, préférences utilisateur (fusionnées, jamais remplacées),
  contexte de travail (remplacé), résumés de run — construits
  entièrement sur `setMemory`/`getMemory` (v0.3), sans nouvelle table ;
  compatible avec la vectorisation future déjà réservée (ADR 0009).
- **Fichiers concernés** : `src/lib/agents/director/memory-helpers.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0089.
- **Tests nécessaires** : voir `tests/agents/director-memory.test.ts`.

### AR-0091 — Contrats des agents métier futurs (types + stubs `DRAFT`)
- **Description** : `capability-contracts.ts` (types TypeScript et
  catalogue déclaratif, sans implémentation) pour Commercial, CRM,
  Marketing, Support, Analyse, Finance, Développement ; génération de
  leur `AgentDefinition` de statut `DRAFT` (jamais installable) depuis ce
  catalogue. Durcissement de `installAgent` : refuse désormais toute
  définition non `PUBLISHED` (nécessaire depuis que des `DRAFT` existent
  réellement en base — voir ADR 0012).
- **Fichiers concernés** :
  `src/lib/agents/director/capability-contracts.ts`,
  `src/lib/agents/bootstrap.ts`, `src/lib/agents/installation-service.ts`.
- **Complexité** : Faible.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0089.
- **Tests nécessaires** : vérification manuelle du catalogue (`DRAFT`,
  jamais listé comme installable).

### AR-0092 — Tableau de bord Director + visualisation graphique du plan
- **Description** : `dashboard-service.ts` (agents actifs, tâches par
  statut, file d'exécution, planifications actives, historique des plans,
  journal, consommation/performance — étend
  `observability.ts#getWorkspaceAgentStats` sans dupliquer le calcul),
  page `/settings/director`, et `director-plan-graph.tsx` (visualisation
  SVG du plan : Director en racine, étapes par rang de dépendance, couleur
  par statut, arêtes de délégation/dépendance).
- **Fichiers concernés** : `src/lib/agents/director/dashboard-service.ts`,
  `src/app/(app)/settings/director/page.tsx`,
  `src/components/director-dashboard-client.tsx`,
  `src/components/director-plan-graph.tsx`,
  `src/app/api/agents/director/**`, `src/components/nav-config.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0090, AR-0091.
- **Tests nécessaires** : vérification manuelle (navigateur, build de
  production) — voir le rapport de livraison v0.4 pour le détail.

### AR-0093 — Correctif : enregistrement défensif du registre d'agents (déjà latent depuis v0.3)
- **Description** : découvert en validant AR-0092 par une vraie requête
  HTTP (pas seulement des tests automatisés) : le registre en mémoire des
  runtimes/outils pouvait rester vide côté requête même après un
  démarrage serveur réussi, **y compris en production**, faisant échouer
  silencieusement l'exécution de tout agent installé depuis v0.3
  (diagnostic compris). Corrigé par un appel défensif et idempotent à
  `registerBuiltInAgentComponents()` au tout début de `executeAgentRun`
  (voir ADR 0013). Une erreur de sérialisation (`Prisma.Decimal` passé à
  un Client Component) découverte dans la même passe a été corrigée dans
  `observability.ts`.
- **Fichiers concernés** : `src/lib/agents/execution-engine.ts`,
  `src/lib/agents/observability.ts`.
- **Complexité** : Faible (une fois la cause identifiée).
- **Estimation** : 0,5 jour.
- **Prérequis** : découvert pendant AR-0092, corrige un défaut de v0.3
  (AR-0082).
- **Tests nécessaires** : vérifié par requête HTTP réelle contre un build
  de production (`next build && next start`), en plus de la suite
  `vitest` existante qui ne l'avait pas détecté (les tests appellent
  `registerBuiltInAgentComponents()` eux-mêmes dans le même process).

**Total estimé du travail réellement livré pour v0.4 : ~11,5 jours.**

---

### Plan initial de v0.4 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0022` à `AR-0026` (facturation client final, socle) ci-
> dessous n'ont pas été traitées dans cette version — voir `ROADMAP.md`
> §1 quater. Reportées après v0.4.

### AR-0022 — Modèle `Invoice` / `InvoiceLine`
- **Description** : nouveaux modèles Prisma (référence unique par
  organisation, statut `DRAFT/SENT/PAID/OVERDUE/CANCELLED`, lignes de
  facture, lien optionnel vers `Quote`).
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0004.
- **Tests nécessaires** : contraintes d'unicité (référence par
  organisation) testées.

### AR-0023 — Génération de facture depuis un devis accepté
- **Description** : action serveur qui transforme un `Quote` au statut
  `ACCEPTED` en `Invoice DRAFT` pré-remplie avec les mêmes lignes.
- **Fichiers concernés** : `src/lib/invoicing.ts` (nouveau),
  `src/app/api/invoices/route.ts` (nouveau),
  `src/app/api/quotes/[id]/route.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0022.
- **Tests nécessaires** : test que les montants de la facture générée
  correspondent exactement à ceux du devis source.

### AR-0024 — Pages UI Facturation
- **Description** : liste des factures, détail, actions (envoyer, marquer
  payée manuellement, annuler), sur le modèle des pages `quotes/`
  existantes.
- **Fichiers concernés** : `src/app/(app)/invoices/**` (nouveau),
  `src/components/invoices-client.tsx` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0023.
- **Tests nécessaires** : test e2e du parcours devis → facture → marquage
  payée.

### AR-0025 — Export PDF simple de facture
- **Description** : génération d'un PDF de facture téléchargeable
  (bibliothèque légère, pas de dépendance lourde de rendu HTML→PDF).
- **Fichiers concernés** : `src/lib/invoice-pdf.ts` (nouveau),
  `src/app/api/invoices/[id]/pdf/route.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0023.
- **Tests nécessaires** : test que le PDF généré contient bien les montants
  et la référence attendus (extraction de texte du PDF en test).

### AR-0026 — Relance automatique d'impayé
- **Description** : règle d'automatisation (`MOD-09`) qui notifie/relance
  quand une facture `SENT` dépasse sa date d'échéance sans passer `PAID`.
- **Fichiers concernés** : `src/lib/automation-engine.ts`,
  seed de règle par défaut dans `prisma/seed.ts`.
- **Complexité** : Faible.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0019, AR-0023.
- **Tests nécessaires** : test que la relance se déclenche exactement au
  bon délai après échéance.

**Total estimé v0.4 : ~7 jours.**

---

## Version 0.5 — Agent Commercial (MOD-24, remplace le plan initial)

> **Statut : ✅ livrée.** Comme pour v0.2/v0.3/v0.4, le plan initial de
> v0.5 (paiement Stripe réel — `MOD-12` partie 2) a été remplacé sur
> demande explicite par un module jugé plus urgent : le premier agent
> **métier** d'Autorun, construit intégralement sur le Framework des
> Agents (v0.3) et délégable par l'Agent Director (v0.4). Le plan initial
> (AR-0027 à AR-0030) est conservé ci-dessous pour référence, reporté
> après v0.5.

### AR-0094 — Schéma Prisma `CommercialProspect`/`CommercialAction`/`PromptTemplate`
- **Description** : migration additive — pipeline à 10 étapes
  (`CommercialStage`), modèle de prospect générique (délibérément
  distinct du `Lead` de Provence 360, voir ADR 0014), action générique à
  discriminant de type (`CommercialActionType`) avec statut d'approbation
  (`CommercialActionStatus`), et modèle de prompt versionné
  (`PromptTemplate`, `@@unique([key, version])`).
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/20260730121924_add_commercial_agent/`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0078 (schéma du Framework des Agents, v0.3).
- **Tests nécessaires** : migration purement additive ; isolation
  multi-tenant (voir AR-0101).

### AR-0095 — Moteur de génération LLM générique multi-fournisseur
- **Description** : `LlmProvider` (`complete(messages) -> texte`),
  registre `Map`-based (même idiome que `registry.ts`/`tool-registry.ts`),
  fournisseur de démonstration déterministe, et 7 adaptateurs réels
  (OpenAI, Anthropic, Google, Mistral, OpenRouter, Azure, Ollama) —
  chacun lève une erreur explicite au moment de l'appel s'il n'est pas
  configuré, jamais à l'enregistrement. Aucun fournisseur câblé en dur
  (piloté par `LLM_PROVIDER`).
- **Fichiers concernés** : `src/lib/agents/llm/**`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0094.
- **Tests nécessaires** : voir `tests/agents/commercial-llm.test.ts`.

### AR-0096 — Moteur de prompts versionnés
- **Description** : `createPromptVersion`/`activatePromptVersion`/
  `renderPrompt` — chaque prompt versionné en base
  (`@@unique([key, version])`), une seule version active à la fois,
  substitution de variables déclarées avec refus explicite si une
  variable manque.
- **Fichiers concernés** : `src/lib/agents/prompts/prompt-engine.ts`,
  `src/lib/agents/commercial/prompt-seeds.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0094.
- **Tests nécessaires** : voir `tests/agents/commercial-prompts.test.ts`.

### AR-0097 — Moteur de scoring extensible
- **Description** : registre de facteurs pondérés (taille de l'entreprise,
  secteur, présence web, qualité du site, présence Google, présence
  réseaux sociaux, historique, potentiel estimé, probabilité de
  conversion — 9 facteurs par défaut, somme des poids = 100),
  `registerScoringFactor` pour l'extensibilité, `computeScore` jamais
  modifié pour ajouter un facteur.
- **Fichiers concernés** : `src/lib/agents/commercial/scoring-engine.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0094.
- **Tests nécessaires** : voir `tests/agents/commercial-scoring.test.ts`.

### AR-0098 — Service commercial + 11 outils déclaratifs
- **Description** : `commercial-service.ts` (CRUD prospect/action,
  approbation, mode autonome via `AgentInstallation.config`) et les 11
  outils `commercial.*` (créer/rechercher/enrichir/qualifier/scorer/
  estimer/rédiger email/relance/proposition/devis/recommander), chacun
  vérifié par permission de workspace (`MANAGE_LEADS`/`MANAGE_FINANCE`/
  `VIEW_WORKSPACE`) en plus du plafond d'outils de l'installation.
- **Fichiers concernés** : `src/lib/agents/commercial/commercial-service.ts`,
  `src/lib/agents/commercial/generation.ts`,
  `src/lib/agents/commercial/memory.ts`,
  `src/lib/agents/tools/commercial-tools.ts`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0095, AR-0096, AR-0097.
- **Tests nécessaires** : voir `tests/agents/commercial-agent.test.ts`.

### AR-0099 — Runtime de l'Agent Commercial + promotion du stub v0.4
- **Description** : `commercial.sales-agent` (dispatch action → outil, et
  `full_cycle` orchestrant tout le cycle en un seul run) ; promotion de
  la définition `DRAFT` créée en v0.4 (`future-commercial-agent`) en
  définition `PUBLISHED` réelle (`commercial-agent`) — mécanisme
  `promoteGlobalAgentDefinition` prévu dès l'ADR 0012.
- **Fichiers concernés** : `src/lib/agents/definitions/commercial-agent.ts`,
  `src/lib/validations/commercial.ts`, `src/lib/agents/bootstrap.ts`,
  `src/lib/agents/director/capability-contracts.ts` (retrait de
  "commercial" des agents futurs).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0098.
- **Tests nécessaires** : voir `tests/agents/commercial-director-delegation.test.ts`
  (délégation réelle depuis le Director).

### AR-0100 — API et tableau de bord de l'Agent Commercial
- **Description** : routes de demande/approbation/refus/envoi
  (`/api/commercial/**`), page `/commercial` (KPIs par étape du pipeline,
  formulaire de cycle complet, actions en attente d'approbation, pipeline,
  historique).
- **Fichiers concernés** : `src/app/api/commercial/**`,
  `src/app/(app)/commercial/page.tsx`,
  `src/components/commercial-dashboard-client.tsx`,
  `src/components/nav-config.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0099.
- **Tests nécessaires** : validé par une vraie requête HTTP contre le
  serveur (voir le rapport de livraison v0.5).

### AR-0101 — Tests d'isolation multi-tenant de l'Agent Commercial
- **Description** : `CommercialProspect`/`CommercialAction` d'une
  organisation invisibles à une autre ; falsification d'identifiant
  rejetée par `NotFoundError`.
- **Fichiers concernés** : `tests/tenant-isolation/commercial.test.ts`.
- **Complexité** : Faible.
- **Estimation** : 0,5 jour.
- **Prérequis** : AR-0098.

**Total estimé du travail réellement livré pour v0.5 : ~12 jours.**

---

### Plan initial de v0.5 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0027` à `AR-0030` (paiement Stripe réel) ci-dessous n'ont
> pas été traitées dans cette version — voir `ROADMAP.md` §1 quinquies.
> Reportées après v0.5.

## Version 0.5 bis — Facturation, paiement Stripe réel (MOD-12 partie 2)

### AR-0027 — Interface `PaymentProvider` + implémentation Stripe
- **Description** : interface générique (`createPaymentLink`,
  `verifyWebhookSignature`) suivant le pattern `AIProvider`/
  `EmailProvider` ; implémentation Stripe Checkout pour le paiement de
  facture en ligne.
- **Fichiers concernés** : `src/lib/payment/types.ts` (nouveau),
  `src/lib/payment/stripe-provider.ts` (nouveau),
  `src/lib/payment/index.ts` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0022.
- **Tests nécessaires** : tests de contrat `PaymentProvider` avec un
  double de test (pas d'appel réseau réel en CI).

### AR-0028 — Webhook Stripe entrant, idempotent
- **Description** : route webhook qui reçoit la confirmation de paiement
  Stripe, vérifie la signature, et marque la facture `PAID` de façon
  idempotente (même événement reçu deux fois → un seul effet), en
  s'appuyant sur `WebhookEvent` existant.
- **Fichiers concernés** : `src/app/api/webhooks/stripe/route.ts`
  (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0027, AR-0037 (file de jobs, pour un traitement
  asynchrone fiable — voir v0.8 ; à défaut traitement synchrone accepté en
  v0.5 avec limitation documentée).
- **Tests nécessaires** : test d'idempotence (rejouer deux fois le même
  événement) ; test de rejet d'une signature invalide.

### AR-0029 — Lien de paiement dans l'email de facture
- **Description** : intégrer le lien de paiement Stripe généré dans l'email
  envoyé au client lors du passage `Invoice` en statut `SENT`.
- **Fichiers concernés** : `src/lib/invoicing.ts`,
  gabarit d'email de facture.
- **Complexité** : Faible.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0027.
- **Tests nécessaires** : test que l'email généré contient un lien de
  paiement valide.

### AR-0030 — Garde-fou "aucune donnée bancaire stockée"
- **Description** : revue de code et test explicite garantissant qu'aucun
  champ de carte bancaire ne transite ni n'est stocké côté Autorun (tout
  passe par la page Stripe hébergée).
- **Fichiers concernés** : `src/lib/payment/**` (revue).
- **Complexité** : Faible.
- **Estimation** : 0,5 jour.
- **Prérequis** : AR-0027.
- **Tests nécessaires** : test statique/grep en CI qui échoue si un champ
  suspect (`cardNumber`, `cvv`...) apparaît dans le schéma Prisma.

**Total estimé v0.5 : ~6 jours.**

---

## Version 0.6 — Workflow Engine (MOD-25, remplace le plan initial)

### AR-0102 — Schéma Prisma `WorkflowDefinition`/`WorkflowVersion`/`WorkflowTriggerBinding`/`WorkflowRun`/`WorkflowRunStep`/`WorkflowRunLog`
- **Description** : identité/version séparées (comme `PromptTemplate`),
  cycle de vie `DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`, index des
  déclencheurs pour résolution rapide, exécutions et journal détaillés.
  Migration purement additive.
- **Fichiers concernés** : `prisma/schema.prisma`,
  `prisma/migrations/20260730133557_add_workflow_engine/`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : aucun (nouvelles tables).

### AR-0103 — Moteur d'expressions et de règles combinables
- **Description** : résolution de variables par portée (workflow/contexte/
  utilisateur/organisation/workspace/agents/résultats/API/formulaires),
  interpolation `{{ }}`, opérateurs de règle (égalité/différence/
  comparaisons/ET/OU/NON/regex/exists/in/dates/permission) plus un point
  d'extension par opérateur personnalisé.
- **Fichiers concernés** : `src/lib/workflows/expressions/**`,
  `src/lib/workflows/conditions/registry.ts`, `src/lib/workflows/graph-types.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0102.

### AR-0104 — Registres de déclencheurs et d'actions (système de plugins)
- **Description** : 14 types de déclencheurs déclaratifs ; 6 actions
  réellement implémentées (appel d'agent générique, envoi d'email, appel
  API sortant, notification, sous-workflow, définition de variable) et 7
  actions honnêtement déclarées non implémentées (voir ADR 0022) ;
  analyseur cron réel à 5 champs.
- **Fichiers concernés** : `src/lib/workflows/triggers/**`,
  `src/lib/workflows/actions/**`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0103.

### AR-0105 — Moteur d'exécution ré-entrant
- **Description** : graphe de noeuds/arêtes exécuté par ticks successifs,
  séquentiel et parallèle (noeuds prêts exécutés concurremment),
  branchement conditionnel avec cascade de noeuds sautés, boucle sur
  collection, attente/délai avec suspension et reprise, sous-workflow
  synchrone borné, timeout par étape, retry avec recul, politiques
  d'erreur (arrêt/ignorer/branche alternative/notifier/escalade au
  Director), compensation logique (rollback non transactionnel).
- **Fichiers concernés** : `src/lib/workflows/execution-engine.ts`,
  `src/lib/agents/installation-service.ts` (helper de résolution
  d'installation extrait pour réutilisation, voir AR-0106),
  `src/lib/agents/execution-engine.ts` (helper `runAgentToCompletion`
  extrait de `delegation-engine.ts`).
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0104.

### AR-0106 — Bus d'évènements générique + intégration Framework des Agents
- **Description** : `src/lib/events/domain-events.ts` (pub/sub en
  mémoire) pour découpler `agents/execution-engine.ts` (qui publie la fin
  d'un `AgentRun`) du Workflow Engine (qui s'y abonne pour le déclencheur
  "Exécution d'un agent"), sans dépendance de compilation dans les deux
  sens. Extraction de `resolveActiveInstallation` (déduplique la
  résolution d'installation par id/catégorie, déjà utilisée par le
  Director).
- **Fichiers concernés** : `src/lib/events/domain-events.ts`,
  `src/lib/workflows/trigger-engine.ts`,
  `src/lib/agents/installation-service.ts`,
  `src/lib/agents/director/delegation-engine.ts` (mis à jour pour
  réutiliser le helper).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0105.

### AR-0107 — Service de cycle de vie des workflows (CRUD/versioning/lifecycle)
- **Description** : créer/modifier (nouvelle version)/activer/désactiver/
  cloner/exporter/importer/archiver ; validation structurelle du graphe
  (cycles, arêtes orphelines, branches condition manquantes) appliquée
  avant tout enregistrement.
- **Fichiers concernés** : `src/lib/workflows/workflow-service.ts`,
  `src/lib/workflows/graph-validation.ts`,
  `src/lib/validations/workflow.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0105.

### AR-0108 — 10 templates prêts à l'emploi + tableau de bord
- **Description** : Prospection/Relance/Suivi client/Création devis/
  Signature/Facturation/Support/Onboarding client/Suivi visite virtuelle/
  Relance paiement, clonables dans un workspace ; tableau de bord
  (workflows actifs/inactifs, historique, temps d'exécution, taux de
  succès/échec, files d'attente, exécutions en cours, goulots
  d'étranglement).
- **Fichiers concernés** : `src/lib/workflows/templates/seed-templates.ts`,
  `src/lib/workflows/dashboard-service.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0107.

### AR-0109 — API complète + éditeur visuel (node editor)
- **Description** : routes CRUD/activation/déclenchement manuel/
  annulation/relance/export/import/webhook générique ; canevas
  glisser-déposer avec zoom/déplacement, connexion par clic,
  inspecteur de noeud/arête par type de bloc, inspecteur de variables,
  validation graphique côté client.
- **Fichiers concernés** : `src/app/api/workflows/**`,
  `src/app/api/webhooks/workflows/**`, `src/app/api/cron/process-workflow-runs/`,
  `src/app/(app)/workflows/**`, `src/components/workflow-*.tsx`,
  `src/components/workflows-list-client.tsx`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0108.

### AR-0110 — Tests du Workflow Engine + isolation multi-tenant
- **Description** : déclencheurs (évènement, cron, bus d'évènements),
  conditions (tous opérateurs), variables, actions (agent réel, HTTP
  simulé, email, notification, échecs explicites), parallélisme,
  timeouts, reprises (retry/attente/branche d'erreur/compensation),
  permissions, isolation multi-tenant, communications avec les agents.
- **Fichiers concernés** : `tests/workflows/*.test.ts`,
  `tests/tenant-isolation/workflows.test.ts`, `tests/helpers/workflow-fixtures.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0109.

**Total estimé du travail réellement livré pour v0.6 : ~15,5 jours.**

---

### Plan initial de v0.6 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0031` et suivantes (gestion documentaire) ci-dessous
> n'ont pas été traitées dans cette version — voir `ROADMAP.md` §1 sexies.
> Reportées après v0.6.

## Version 0.6 bis — Gestion documentaire (MOD-13)

### AR-0031 — Interface `StorageProvider` + implémentation locale
- **Description** : interface (`upload`, `download`, `delete`,
  `getSignedUrl`) suivant le pattern des autres providers ;
  `LocalStorageProvider` pour le mode démo/self-host (stockage disque,
  sans dépendance payante).
- **Fichiers concernés** : `src/lib/storage/types.ts` (nouveau),
  `src/lib/storage/local-provider.ts` (nouveau),
  `src/lib/storage/index.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0004.
- **Tests nécessaires** : tests de contrat `StorageProvider`.

### AR-0032 — Modèle `Document` polymorphe
- **Description** : table `Document` (nom, type MIME, taille, propriétaire
  polymorphe : `leadId`/`customerId`/`missionId` optionnels).
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0031.
- **Tests nécessaires** : test d'isolation multi-tenant sur l'accès aux
  documents (gabarit AR-0004).

### AR-0033 — UI upload/consultation de documents
- **Description** : composant d'upload et de liste de documents intégré
  aux fiches prospect/client/mission existantes.
- **Fichiers concernés** : `src/components/document-manager.tsx`
  (nouveau), `src/app/(app)/leads/[id]/**`,
  `src/app/(app)/missions/**`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0032.
- **Tests nécessaires** : test e2e upload → téléchargement → suppression.

### AR-0034 — URLs signées à expiration courte
- **Description** : génération d'URL de téléchargement signée et
  temporaire (HMAC, expiration configurable), aucune URL publique
  permanente par défaut.
- **Fichiers concernés** : `src/lib/storage/local-provider.ts`,
  `src/app/api/documents/[id]/route.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0031.
- **Tests nécessaires** : test qu'une URL expirée est refusée
  (`crypto.timingSafeEqual`, même pattern que `unsubscribe-token.ts`).

### AR-0035 — Implémentation `S3StorageProvider`
- **Description** : deuxième implémentation de `StorageProvider` pour un
  stockage objet compatible S3 (production/SaaS), sélection par
  `STORAGE_PROVIDER=s3`.
- **Fichiers concernés** : `src/lib/storage/s3-provider.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0031.
- **Tests nécessaires** : tests de contrat identiques à AR-0031, exécutés
  contre un service S3 compatible de test (MinIO en CI).

**Total estimé v0.6 : ~7 jours.**

---

## Version 0.7 — Intelligence documentaire (MOD-26)

### AR-0111 — Schéma Prisma Memory Engine (`MemoryEntry`) + Knowledge Engine (`KnowledgeDocument`/`KnowledgeChunk`/`KnowledgeIndexLog`/`EmbeddingRequest`)
- **Description** : modèles multi-niveaux (7 `MemoryScopeType` × 5
  `MemoryKind`, versionné) et documentaire (19 `KnowledgeSourceType`,
  fragment avec embedding `Float[]`, journal d'indexation, journal
  d'embedding avec coût estimé) ; extension de `PromptTemplate` (locale,
  `parentKey`, `variableSchema`).
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Élevée.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0094 (modèles Commercial/Prompt existants).

### AR-0112 — Memory Engine (`src/lib/memory/memory-engine.ts`)
- **Description** : écriture versionnée, historique, TTL par défaut par
  nature, expiration → archivage, purge définitive, compression/résumé
  automatique via le moteur LLM générique au-delà d'un seuil de taille.
- **Fichiers concernés** : `src/lib/memory/memory-engine.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0111, AR-0095 (moteur LLM générique).

### AR-0113 — Abstraction embeddings (8 fournisseurs) + cache/coût/journal
- **Description** : registre `EmbeddingProvider` (OpenAI, VoyageAI, Jina,
  Cohere, Nomic, Ollama, HuggingFace/BGE, démonstration déterministe),
  couche de service avec cache en mémoire, coût estimé, journal
  (`EmbeddingRequest`).
- **Fichiers concernés** : `src/lib/knowledge/embeddings/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0111.

### AR-0114 — Abstraction bases vectorielles (8 backends anticipés)
- **Description** : registre `VectorStore` (PgVector par défaut — Postgres
  natif + cosinus applicatif, aucune extension `vector` disponible —,
  Pinecone, Qdrant, Weaviate, Chroma réellement implémentés, Milvus/FAISS/
  LanceDB honnêtement déclarés non implémentés).
- **Fichiers concernés** : `src/lib/knowledge/vector-stores/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0111.

### AR-0115 — Pipeline d'ingestion (registre de parseurs, 19 sources)
- **Description** : registre `DocumentParser` par `KnowledgeSourceType` —
  parseurs texte (Markdown/Note/Documentation/Email/HTML), parseurs
  d'enregistrements DB existants (CRM/Devis/Conversation/Décision/
  Workflow/Log, strictement scopés organisation/workspace), stubs
  honnêtes (PDF/Word/Excel/PowerPoint/Facture, Image/Audio/Vidéo).
- **Fichiers concernés** : `src/lib/knowledge/parsers/**` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0111.

### AR-0116 — Moteur d'indexation (`src/lib/knowledge/indexing-engine.ts`)
- **Description** : ajout/mise à jour (détection de changement par
  empreinte), suppression, renommage, déplacement, réindexation
  incrémentale/complète/en lot avec priorité, journalisation systématique
  (succès et échec).
- **Fichiers concernés** : `src/lib/knowledge/indexing-engine.ts`,
  `src/lib/knowledge/chunking.ts` (nouveaux).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0113, AR-0114, AR-0115.

### AR-0117 — Moteurs de recherche (plein texte/vectorielle/hybride/similarité) + ranking
- **Description** : recherche plein texte (sans `tsvector`, filtrage SQL +
  classement applicatif), vectorielle (re-vérification de portée même
  après un index externe déjà filtré), hybride (fusion de rangs
  réciproques), par similarité (plus proches voisins d'un fragment),
  filtrable par tags/type de source/documents/organisation/workspace ;
  suivi d'usage par document.
- **Fichiers concernés** : `src/lib/knowledge/search/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0116.

### AR-0118 — Context Engine (`src/lib/context/context-engine.ts`)
- **Description** : sélection automatique et assemblage du contexte avant
  un appel IA (documents utiles, préférences, mémoire d'agent, décisions,
  résultats précédents, historique de conversation, contraintes métier
  fournies par l'appelant), classement par priorité, compression
  (troncage puis résumé via le moteur LLM) si le budget de tokens est
  dépassé.
- **Fichiers concernés** : `src/lib/context/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0112, AR-0117.

### AR-0119 — Tableau de bord d'observabilité + intégration obligatoire
- **Description** : `getKnowledgeDashboard`/`getMemoryDashboard`
  (documents, fragments, embeddings, indexation, cache, coût IA,
  documents les plus utilisés, mémoire par niveau/nature) ; câblage
  obligatoire de `generateNarrative` (Agent Commercial) via
  `assembleContext`, seul point d'appel IA existant dans le Framework des
  Agents à ce jour.
- **Fichiers concernés** : `src/lib/knowledge/dashboard-service.ts`,
  `src/lib/memory/dashboard-service.ts`,
  `src/app/api/knowledge/dashboard/route.ts`,
  `src/app/(app)/settings/knowledge/page.tsx` (nouveaux),
  `src/lib/agents/commercial/generation.ts`,
  `src/lib/agents/tools/commercial-tools.ts` (modifiés).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0118.

### AR-0120 — Extension du Prompt Engine (locale/héritage/schéma typé)
- **Description** : `PromptTemplate` étendu sur place (pas dupliqué) :
  `locale`, `parentKey` (héritage borné, cycles détectés),
  `variableSchema` (typage, requis, description), résolution de chaîne
  d'héritage et repli sur `"fr"`.
- **Fichiers concernés** : `src/lib/agents/prompts/prompt-engine.ts`
  (modifié), `prisma/schema.prisma`.
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0111.

### AR-0121 — Tests (mémoire, ingestion, indexation, embeddings, recherche, contexte, intégration, multi-tenant, performance)
- **Description** : 41 nouveaux tests contre une vraie base PostgreSQL —
  voir la liste complète dans `ROADMAP.md` §MOD-26.
- **Fichiers concernés** : `tests/memory/**`, `tests/knowledge/**`,
  `tests/context/**`, `tests/agents/context-engine-integration.test.ts`,
  `tests/tenant-isolation/knowledge.test.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0112 à AR-0120.

### AR-0122 — ADR 0023 à 0029
- **Description** : documentation des 7 décisions d'architecture de cette
  version (coexistence mémoire, modèle document/fragment, absence de
  pgvector, sécurité/scope, honnêteté des stubs, extension du Prompt
  Engine, intégration obligatoire du Context Engine).
- **Fichiers concernés** : `docs/adr/0023-*.md` à `docs/adr/0029-*.md`.
- **Complexité** : Basse.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0111 à AR-0121.

**Total estimé du travail réellement livré pour v0.7 : ~18,5 jours.**

---

### Plan initial de v0.7 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0036` et suivantes (calendrier) ci-dessous n'ont pas été
> traitées dans cette version — voir `ROADMAP.md` §1 septies. Reportées
> après v0.7.

## Version 0.7 bis — Calendrier (MOD-14)

### AR-0036 — Vue calendrier interne (jour/semaine/mois)
- **Description** : nouvelle page calendrier affichant les `Appointment`
  existants en vue calendrier plutôt qu'en simple liste, sans dépendance
  externe.
- **Fichiers concernés** : `src/app/(app)/calendar/page.tsx` (nouveau),
  `src/components/calendar-view.tsx` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : aucun (s'appuie sur `Appointment` existant).
- **Tests nécessaires** : test d'affichage correct des rendez-vous sur
  plusieurs vues (jour/semaine/mois).

### AR-0037 — Interface `CalendarProvider`
- **Description** : interface générique (`listEvents`, `createEvent`,
  `updateEvent`, `deleteEvent`) suivant le pattern des autres providers.
- **Fichiers concernés** : `src/lib/calendar/types.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0036.
- **Tests nécessaires** : tests de contrat.

### AR-0038 — Implémentation Google Calendar
- **Description** : synchronisation bidirectionnelle avec Google Calendar
  (OAuth, lecture + écriture), stratégie "dernière écriture gagne" en cas
  de conflit (documentée explicitement, pas de résolution fine à ce
  stade).
- **Fichiers concernés** : `src/lib/calendar/google-provider.ts`
  (nouveau).
- **Complexité** : Très élevée.
- **Estimation** : 4 jours.
- **Prérequis** : AR-0037.
- **Tests nécessaires** : test de contrat + test manuel documenté sur
  compte Google de test (OAuth non simulable simplement en CI).

### AR-0039 — Implémentation Outlook Calendar
- **Description** : équivalent AR-0038 pour Microsoft Graph/Outlook
  Calendar.
- **Fichiers concernés** : `src/lib/calendar/outlook-provider.ts`
  (nouveau).
- **Complexité** : Très élevée.
- **Estimation** : 4 jours.
- **Prérequis** : AR-0037.
- **Tests nécessaires** : idem AR-0038.

**Total estimé v0.7 bis : ~12 jours** (AR-0038/AR-0039 parallélisables
entre deux développeurs si disponibles → ~8 jours calendaires).

---

## Version 0.8 — Automation Engine Enterprise (MOD-27, remplace le plan initial)

### AR-0123 — Schéma Prisma du noyau de jobs (`Automation`/`AutomationVersion`/`AutomationTriggerBinding`/`AutomationRun`/`AutomationRunLog`/`AutomationJob`/`AutomationJobLog`/`AutomationLock`/`AutomationCircuitBreaker`)
- **Description** : identité/version séparées (même principe que
  `WorkflowDefinition`/`WorkflowVersion`), noyau de jobs durable
  (`AutomationJob` — statut, tentative, politique de retry, clé de
  verrou/concurrence, priorité, planification, réclamation), verrou par
  bail (`AutomationLock`) et disjoncteur persisté
  (`AutomationCircuitBreaker`).
- **Fichiers concernés** : `prisma/schema.prisma`, deux migrations
  additives.
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0094 (modèles Workflow Engine existants, même gabarit
  identité/version).

### AR-0124 — Queue Manager (Postgres par défaut + mémoire + stubs BullMQ/Redis/RabbitMQ/SQS/Kafka)
- **Description** : réclamation atomique (`FOR UPDATE SKIP LOCKED`, deux
  instructions simples — jamais une CTE imbriquée, voir ADR 0032) ;
  fournisseur mémoire réel pour les tests ; fournisseurs distants
  honnêtement déclarés non implémentés.
- **Fichiers concernés** : `src/lib/automation/queue/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0123.

### AR-0125 — Lock Manager (bail Postgres + mémoire) et Concurrency Manager
- **Description** : verrou par bail (jamais `pg_advisory_lock`, voir ADR
  0032) ; limite globale de jobs `RUNNING`, limite par `concurrencyKey`,
  rate limiter en mémoire par processus.
- **Fichiers concernés** : `src/lib/automation/lock/**`,
  `src/lib/automation/concurrency/**` (nouveaux).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0123.

### AR-0126 — Retry Engine (7 stratégies) + Circuit Breaker persisté
- **Description** : exponentiel, linéaire, immédiat, manuel, conditionnel
  (réutilise le Condition Engine), infini borné en durée, limité ;
  disjoncteur à 3 états (`CLOSED`/`OPEN`/`HALF_OPEN`) persisté, cohérent
  entre plusieurs instances de worker.
- **Fichiers concernés** : `src/lib/automation/retry/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0123.

### AR-0127 — Dead Letter Queue + Priority Manager
- **Description** : DLQ = vue sur `AutomationJob.status = 'DEAD_LETTERED'`
  (jamais une table séparée), relance strictement scopée organisation/
  workspace ; niveaux de priorité nommés au-dessus de l'entier de tri déjà
  appliqué par le Queue Manager.
- **Fichiers concernés** : `src/lib/automation/dlq/**`,
  `src/lib/automation/priority/**` (nouveaux).
- **Complexité** : Basse.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0123, AR-0124.

### AR-0128 — Enterprise Scheduler (cron complexe, fuseau/DST, calendriers, blackout, fenêtres d'exécution)
- **Description** : évaluateur cron avec plages/listes/pas/alias ;
  extraction de champs "heure murale" par fuseau IANA via
  `Intl.DateTimeFormat` natif (aucune nouvelle dépendance) ; combinaison
  cron + jours ouvrés + jours fériés + blackout + fenêtres d'exécution en
  une fonction sans état, testable.
- **Fichiers concernés** : `src/lib/automation/scheduler/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : aucun (module autonome, voir ADR 0036).

### AR-0129 — Condition Engine (réutilisé) + Trigger Engine/Event Dispatcher (catalogue de 26 déclencheurs)
- **Description** : ré-export du moteur d'expressions du Workflow Engine
  (aucune duplication) ; bus d'évènements générique réutilisé ; catalogue
  déclaratif des 26 types de déclencheurs demandés par le brief.
- **Fichiers concernés** : `src/lib/automation/conditions/**`,
  `src/lib/automation/triggers/**` (nouveaux).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : aucun.

### AR-0130 — Câblage réel des points d'émission (leads CRUD, auth, organisation/workspace, import) + Trigger Engine (évènements/cron/webhook)
- **Description** : `fireAutomationsForEvent` (scopé strictement par
  organisation), `processDueAutomationSchedules` (`schedule.cron` réel),
  `fireAutomationWebhook` ; abonnement explicite à 8 clés d'évènement
  réellement publiées par 6 routes existantes.
- **Fichiers concernés** : `src/lib/automation/trigger-engine.ts`,
  `src/lib/automation/bootstrap.ts` (nouveaux),
  `src/app/api/leads/**`, `src/app/api/auth/{register,login}/route.ts`,
  `src/lib/workspace-service.ts` (modifiés : un appel
  `publishAutomationEvent` ajouté par point d'émission).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0129.

### AR-0131 — Automation Registry (CRUD/versions/cycle de vie/export-import) + graphe versionné (10 types de noeuds)
- **Description** : même gabarit que `workflow-service.ts` (v0.6) ; graphe
  avec `switch`/`map`/`join` explicite en plus de l'ensemble du Workflow
  Engine.
- **Fichiers concernés** : `src/lib/automation/registry/**`,
  `src/lib/automation/graph-types.ts`,
  `src/lib/automation/graph-validation.ts` (nouveaux).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0123.

### AR-0132 — Registre de jobs/actions pluggables (12 gestionnaires réels + 8 stubs honnêtes)
- **Description** : HTTP, email, notification, variable, agent, workflow,
  automatisation imbriquée, indexation Knowledge Engine, écriture Memory
  Engine, CRUD Lead ; SMS/fichier/document/client/tâche/devis/facture/
  rendez-vous honnêtement déclarés non implémentés.
- **Fichiers concernés** : `src/lib/automation/actions/**` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0123.

### AR-0133 — Job Executor (progression de graphe ré-entrante, noeuds `loop`/`map`/`join`/`subautomation`, notification parent↔enfant)
- **Description** : `advanceAutomationRun` (jamais bloquant),
  `processAutomationJobs` (réclamation + exécution + retry/disjoncteur/
  DLQ), moteur de tick générique réutilisé pour le graphe racine et les
  corps de boucle/map, notification explicite du run parent à la
  terminaison d'un run enfant.
- **Fichiers concernés** : `src/lib/automation/executor/**` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0124, AR-0125, AR-0126, AR-0127, AR-0129, AR-0131,
  AR-0132.

### AR-0134 — Tableau de bord d'observabilité
- **Description** : automatisations par statut, runs (succès/échec/durée
  moyenne/min/max), jobs par statut/type (durée, taux d'échec), retries
  totaux, profondeur de file, workers actifs (heuristique honnête), DLQ.
- **Fichiers concernés** : `src/lib/automation/dashboard-service.ts`
  (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0133.

### AR-0135 — API REST typée (CRUD/cycle de vie/versions/runs/jobs/DLQ/tableau de bord/catalogue/cron/webhook)
- **Description** : 18 routes mirroir de `src/app/api/workflows/**`, plus
  jobs/DLQ (sans équivalent Workflow Engine), plus cron applicatif et
  webhook entrant dédiés.
- **Fichiers concernés** : `src/app/api/automations/**`,
  `src/app/api/cron/process-automations/route.ts`,
  `src/app/api/webhooks/automations/[workspaceId]/[automationKey]/route.ts`
  (nouveaux), `src/lib/validations/automation.ts`,
  `src/lib/workspace-permissions.ts` (permission `MANAGE_AUTOMATIONS`).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0130, AR-0131, AR-0133, AR-0134.

### AR-0136 — UI (liste + tableau de bord, éditeur de version JSON, détail de run, Dead Letter Queue) + navigation
- **Description** : `/automations`, `/automations/[id]`,
  `/automations/runs/[runId]`, `/automations/dlq` ; entrée de navigation.
  Éditeur de graphe en JSON (pas de canevas visuel glisser-déposer pour
  cette phase — voir limite connue, `MILESTONES.md` §v0.8).
- **Fichiers concernés** : `src/app/(app)/automations/**`,
  `src/components/automation-*-client.tsx` (nouveaux),
  `src/components/nav-config.ts` (modifié).
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0135.

### AR-0137 — Tests (Queue/Lock/Concurrency/Retry/DLQ/Priority/Scheduler/Trigger Engine/Registry/actions/Job Executor/tableau de bord/permissions) + E2E dédié
- **Description** : 90 nouveaux tests contre une vraie base PostgreSQL,
  dont un test de charge de concurrence du Queue Manager (ayant révélé et
  fait corriger un bug réel, voir ADR 0032) ; un nouveau parcours de bout
  en bout (`tests/e2e/automation-golden-path.mjs`).
- **Fichiers concernés** : `tests/automation/**`,
  `tests/e2e/automation-golden-path.mjs`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0124 à AR-0136.

### AR-0138 — ADR 0030 à 0037
- **Description** : documentation des 8 décisions d'architecture de cette
  version (coexistence + noyau de jobs, exécution asynchrone/registre vs
  exécuteur, Queue/Lock Manager, Circuit Breaker persisté, Condition
  Engine/Event Dispatcher réutilisés, DLQ scopée tenant, Scheduler
  autonome/Priority Manager, honnêteté du câblage des déclencheurs).
- **Fichiers concernés** : `docs/adr/0030-*.md` à `docs/adr/0037-*.md`.
- **Complexité** : Basse.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0123 à AR-0137.

**Total estimé du travail réellement livré pour v0.8 : ~26,5 jours.**

---

### Plan initial de v0.8 (non traité dans cette version, conservé pour référence)

> Les tâches `AR-0040` à `AR-0046` (infrastructure de jobs minimale via
> `pg-boss`) ci-dessous n'ont pas été traitées dans cette version — leur
> périmètre technique est entièrement délivré par le noyau de jobs de
> `MOD-27` ci-dessus (Postgres, pas `pg-boss` — voir ADR 0032). Reportée
> après v0.8 sous forme de migration des modules existants vers ce noyau,
> voir `ROADMAP.md` §1 octies.

## Version 0.8 bis — Infrastructure asynchrone minimale pour les traitements existants (MOD-15, plan initial, reporté)

### AR-0040 — Intégration `pg-boss`
- **Description** : mise en place de `pg-boss` (file de jobs sur
  PostgreSQL existant, pas de nouvelle brique d'infra), définition du
  worker (`apps/worker` logique ou script dédié dans le monolithe actuel).
- **Fichiers concernés** : `src/lib/jobs/queue.ts` (nouveau),
  `package.json` (dépendance), `docker-compose.yml` (service worker).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0001.
- **Tests nécessaires** : test qu'un job planifié s'exécute et qu'un job en
  échec est retenté.

### AR-0041 — Job `process-sequences`
- **Description** : encapsuler `processDueSequences` existant tel quel
  dans un job planifié périodique, en remplacement (ou en complément
  transitoire) de `POST /api/cron/process-sequences`.
- **Fichiers concernés** : `src/lib/jobs/process-sequences-job.ts`
  (nouveau), `src/lib/sequence-engine.ts` (inchangé en logique).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0040.
- **Tests nécessaires** : non-régression complète du comportement des
  séquences (golden path).

### AR-0042 — Job `send-email`
- **Description** : découpler l'envoi d'email du cycle de requête HTTP,
  avec retry automatique en cas d'échec transitoire.
- **Fichiers concernés** : `src/lib/jobs/send-email-job.ts` (nouveau),
  `src/lib/email/index.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0040.
- **Tests nécessaires** : test de retry sur échec simulé.

### AR-0043 — Job `run-ai-request`
- **Description** : passer les appels IA potentiellement longs
  (`generateMessage`, `analyzeLead`) en job asynchrone plutôt qu'en appel
  synchrone bloquant, avec notification de complétion côté UI (polling ou
  websocket léger — polling suffisant à ce stade).
- **Fichiers concernés** : `src/lib/jobs/run-ai-request-job.ts` (nouveau),
  `src/app/api/messages/generate/route.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0040.
- **Tests nécessaires** : test de non-régression du parcours de
  génération de message (golden path).

### AR-0044 — Job `import-csv-large`
- **Description** : sortir l'import CSV volumineux du cycle requête/réponse
  HTTP (timeout actuel potentiel sur gros fichiers).
- **Fichiers concernés** : `src/lib/jobs/import-csv-job.ts` (nouveau),
  `src/lib/csv-import.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0040.
- **Tests nécessaires** : test d'import d'un fichier volumineux (> 5000
  lignes) sans timeout.

### AR-0045 — Job `process-stripe-webhook` et `sync-calendar`
- **Description** : migrer les deux webhooks/synchronisations
  potentiellement lents (AR-0028, AR-0038/39) vers la file de jobs pour
  garantir un retour HTTP rapide au fournisseur externe.
- **Fichiers concernés** : `src/lib/jobs/stripe-webhook-job.ts`,
  `src/lib/jobs/sync-calendar-job.ts` (nouveaux).
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0040, AR-0028, AR-0038.
- **Tests nécessaires** : non-régression des tests d'idempotence Stripe
  déjà écrits (AR-0028).

### AR-0046 — Tableau de bord des jobs en échec
- **Description** : page d'administration listant les jobs en échec/en
  dead-letter avec possibilité de relance manuelle.
- **Fichiers concernés** : `src/app/(app)/settings/jobs/page.tsx`
  (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0040.
- **Tests nécessaires** : test qu'un job en dead-letter apparaît et peut
  être relancé manuellement.

**Total estimé v0.8 bis (plan initial, reporté) : ~12,5 jours.**

---

## Version 0.9 — Provence 360 Operating System (MOD-28, remplace le plan initial)

### AR-0139 — Extensions CRM (Company/Property/Attachment) et ADR 0038/0039
- **Description** : décisions de périmètre v0.9 (ADR 0038), schéma Prisma
  additif — `Company`, `Property`, `Attachment` (polymorphe, même
  convention qu'`AuditLog`), extension de `LeadCategory` (5 valeurs).
- **Fichiers concernés** : `prisma/schema.prisma`, migrations,
  `src/lib/validations/crm.ts`, `docs/adr/0038-*.md`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : aucun.

### AR-0140 — Chronologie (timeline-service.ts)
- **Description** : agrégation en lecture seule de `LeadNote`/`Message`/
  `Conversation`/`Appointment`/`Task`/`Quote`/`AuditLog`/`Attachment`,
  jamais une nouvelle table.
- **Fichiers concernés** : `src/lib/crm/timeline-service.ts`,
  `src/app/api/leads/[id]/timeline/route.ts`.
- **Complexité** : Basse.
- **Estimation** : 0,5 jour.
- **Prérequis** : AR-0139.

### AR-0141 — Pipeline personnalisable (`PipelineStage`)
- **Description** : étapes affichées personnalisables (libellé/couleur/
  ordre) par organisation, seedées 1:1 avec `LeadStage` — `LeadStage`
  reste l'unique source de vérité métier.
- **Fichiers concernés** : `src/lib/crm/pipeline-service.ts`,
  `src/components/pipeline-stages-manager.tsx`,
  `src/app/api/pipeline-stages/**`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0139.

### AR-0142 — Devis étendus (remise/TVA/PDF/versionnement/signature)
- **Description** : `Quote` étendu (remise, TVA, PDF via `pdf-lib`,
  versionnement immuable `QuoteVersion`), abstraction de signature
  électronique (fournisseur démo).
- **Fichiers concernés** : `src/lib/crm/quote-service.ts`,
  `quote-pricing.ts`, `quote-pdf.ts`, `commercial-document-pdf.ts`,
  `src/lib/quotes/esignature/**`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0139.

### AR-0143 — Facturation (`Invoice`/`InvoiceLine`, conversion depuis un devis)
- **Description** : nouveaux modèles `Invoice`/`InvoiceLine`, conversion
  explicite (jamais automatique) d'un devis `ACCEPTED`.
- **Fichiers concernés** : `src/lib/crm/invoice-service.ts`,
  `invoice-pdf.ts`, `src/app/api/invoices/**`,
  `src/app/api/quotes/[id]/convert-to-invoice/route.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0142.

### AR-0144 — Communication Hub (registre de canaux SMS/WhatsApp/téléphone/webhook)
- **Description** : registre par canal réutilisant `Integration.config` ;
  webhook sortant réel (HMAC optionnel) ; SMS/WhatsApp/téléphone en stubs
  honnêtes.
- **Fichiers concernés** : `src/lib/communication/**`,
  `src/app/api/communications/**`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : aucun.

### AR-0145 — Connecteurs email réels (SMTP/Resend/Postmark/Brevo)
- **Description** : implémentation réelle et complète, configuration par
  organisation via `Integration.config` (repli sur variable
  d'environnement), échec explicite si non configuré. Délivre le
  périmètre AR-0052/53/54 (email réel) du plan initial de v0.9.
- **Fichiers concernés** : `src/lib/email/providers/{smtp,resend,
  postmark,brevo}.ts`, `src/lib/email/config.ts`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : aucun.
- **Tests nécessaires** : vrais serveurs SMTP/HTTP locaux (pas de mock).

### AR-0146 — Google Calendar réel (OAuth2 + REST)
- **Description** : `fetch()` direct (cohérent avec le reste de la
  plateforme), synchronisation best-effort des rendez-vous, repli
  honnête sur les rendez-vous déjà enregistrés si non connecté.
- **Fichiers concernés** : `src/lib/calendar/google/**`,
  `src/app/api/calendar/**`.
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : aucun.
- **Tests nécessaires** : vrai serveur HTTP local (OAuth + Calendar API).

### AR-0147 — Visites 3D (`VirtualTour`)
- **Description** : nouveau module lié à une `Mission` existante (réutilise
  planification/prestataire), jamais une duplication de `Mission`.
- **Fichiers concernés** : `src/lib/production/virtual-tour-service.ts`,
  `src/app/(app)/visits/page.tsx`, `src/app/api/virtual-tours/**`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0139.

### AR-0148 — Tableaux de bord métier (Production/Clients/Visites/RDV/IA/Performance)
- **Description** : 6 tableaux de bord non encore couverts (Commercial/CA
  et Automatisations déjà livrés en v0.5/v0.8).
- **Fichiers concernés** : `src/lib/dashboards/dashboard-service.ts`,
  `src/app/(app)/dashboards/page.tsx`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0142, AR-0143, AR-0147.

### AR-0149 — 7 agents métier (Prospection/Relance/Devis/Planning/Réseaux sociaux/Support/Analyse)
- **Description** : même patron que l'Agent Commercial (v0.5), mais
  opèrent sur les vraies données CRM et réutilisent les vrais services
  v0.9 — jamais un modèle de démonstration séparé (voir ADR 0039).
  Support/Analyse promeuvent les stubs DRAFT créés en v0.4.
- **Fichiers concernés** : `src/lib/agents/tools/*-tools.ts`,
  `src/lib/agents/definitions/*-agent.ts`,
  `src/lib/agents/shared/{generation,simple-runtime}.ts`,
  `src/lib/agents/business-agents-prompt-seeds.ts`.
- **Complexité** : Très élevée.
- **Estimation** : 5 jours.
- **Prérequis** : AR-0142, AR-0144, AR-0145, AR-0146, AR-0147.

### AR-0150 — 10 automatisations métier prêtes à l'emploi
- **Description** : gabarits `Automation`/`AutomationVersion` scellés au
  bootstrap, clonables (même mécanisme que les templates du Workflow
  Engine, v0.6) — extension de `REAL_EMISSION_EVENT_KEYS` (ADR 0037) pour
  que chaque déclencheur/action référencé soit réellement câblé.
- **Fichiers concernés** : `src/lib/automation/templates/seed-templates.ts`,
  `src/lib/automation/trigger-engine.ts`,
  `src/lib/automation/triggers/builtin-triggers.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0142, AR-0143, AR-0147, AR-0149.

### AR-0151 — Réglages (entreprise/TVA/logo/email/IA)
- **Description** : coordonnées légales/TVA/logo de l'organisation
  (déjà en base depuis AR-0139 mais jamais éditables), identifiants email
  par organisation (jamais un secret renvoyé en clair), statut honnête du
  fournisseur IA actif.
- **Fichiers concernés** : `src/components/organization-form.tsx`,
  `src/components/email-settings-form.tsx`,
  `src/app/api/settings/integrations/email/route.ts`,
  `src/app/(app)/settings/page.tsx`.
- **Complexité** : Basse.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0145.

### AR-0152 — ADR 0038/0039 et validation finale
- **Description** : documentation des décisions de périmètre/architecture
  de cette version, validation complète (typecheck/lint/tests/build) et
  vérification manuelle contre un serveur de développement réel.
- **Fichiers concernés** : `docs/adr/0038-*.md`, `docs/adr/0039-*.md`,
  `ROADMAP.md`, `MILESTONES.md`, `BACKLOG.md`, `docs/02-ARCHITECTURE.md`,
  `DEVELOPMENT_GUIDE.md`.
- **Complexité** : Basse.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0139 à AR-0151.

**Total estimé du travail réellement livré pour v0.9 : ~27 jours.**

---

### Plan initial de v0.9 (partiellement livré, poursuivi en v0.9 bis)

> La tâche `AR-0052` (`SmtpEmailProvider`) ci-dessous est livrée (sous une
> forme étendue à Resend/Postmark/Brevo et à la configuration par
> organisation) via `AR-0145` ci-dessus. `AR-0047` à `AR-0051`, `AR-0053`
> et `AR-0054` sont traitées dans la section "Version 0.9 bis"
> ci-dessous — voir `ROADMAP.md` §1 novies.

## Version 0.9 bis — Observabilité + connecteurs réels (MOD-16, MOD-04, MOD-06)

> **Statut : en cours d'implémentation.** État des lieux réalisé avant
> exécution (relecture du code, pas seulement de la roadmap) : `AR-0047`
> est déjà satisfaite depuis une phase antérieure (`src/lib/logger.ts`,
> pino, redaction, aucun `console.log` brut dans `src/` — règle de lint
> active) — seul un test de non-régression manquait. `AR-0052` est déjà
> livrée via `AR-0145` (v0.9). Le reste (`AR-0048`/`0049`/`0050`/`0051`/
> `0053`/`0054`) est implémenté dans cette version, en réutilisant les
> conventions déjà établies (fournisseur réel + repli honnête sans
> identifiants, jamais un faux succès ; appel HTTP direct plutôt qu'un
> SDK tiers lourd).

### AR-0047 — Logs structurés (pino) — déjà livrée, test de non-régression ajouté
- **Description** : `src/lib/logger.ts` (pino, `redact` sur
  password/token/secret/authorization, aucun `console.log` brut autorisé
  dans `src/` par la configuration ESLint) est en place depuis une phase
  antérieure à v0.9 bis. Seul manquait un test prouvant que la
  redaction fonctionne réellement.
- **Fichiers concernés** : `tests/observability/logger.test.ts` (nouveau).
- **Complexité** : Basse.
- **Tests nécessaires** : un log contenant un champ sensible listé ne
  doit jamais faire apparaître sa valeur en clair dans la sortie.

### AR-0048 — Capture d'erreurs (Sentry, via l'API HTTP d'ingestion — pas de SDK)
- **Description** : intégration RÉELLE et complète de l'API d'ingestion
  Sentry (format "envelope", appel `fetch()` direct — même convention que
  les fournisseurs LLM/email/Calendar : jamais de SDK tiers lourd), lue
  depuis `SENTRY_DSN` (variable d'environnement, réglage de déploiement -
  pas par organisation, même principe que le choix du fournisseur IA).
  Échoue/no-op explicitement sans DSN configuré (jamais un faux succès) ;
  le journal structuré (AR-0047) reste TOUJOURS écrit, que Sentry soit
  configuré ou non. Complète (ne remplace pas) le mécanisme déjà existant
  `reportClientError`/`POST /api/client-errors` (capture des erreurs
  React côté navigateur) et `toApiErrorResponse` (erreurs serveur ≥ 500
  uniquement — les 4xx sont des erreurs métier attendues, pas des
  incidents).
- **Fichiers concernés** : `src/lib/observability/error-tracking.ts`
  (nouveau), `src/lib/errors.ts` (branchement dans
  `toApiErrorResponse`), `src/app/api/client-errors/route.ts`.
- **Complexité** : Moyenne.
- **Tests nécessaires** : envoi réel vérifié contre un vrai petit serveur
  HTTP local (comme les fournisseurs email/Calendar) ; no-op explicite
  sans DSN ; jamais de secret (DSN) journalisé en clair.

### AR-0049 — Métriques de base
- **Description** : (a) coût IA cumulé par organisation — agrégation
  RÉELLE de `AIRequest.estimatedCostUsd` (déjà journalisé depuis v0.3,
  jamais exploité en agrégat) ; (b) taux de succès/échec d'envoi email —
  nouvelle écriture d'`AuditLog` (`email.sent`/`email.failed`, même
  convention que `communication.<channel>.<status>` du Communication
  Hub) aux points d'envoi réel existants (`sequence-engine.ts`, actions
  `email.send`), puis agrégation ; (c) latence API — nouvelle table
  légère `ApiRequestMetric` + petit assistant `withApiMetrics()`
  appliqué de façon incrémentale à quelques routes représentatives
  (`/api/leads`, `/api/messages/generate`, `/api/quotes`) plutôt qu'un
  middleware global sur TOUTES les routes (risque de régression
  disproportionné pour la valeur — voir ADR dédiée) — extensible route
  par route sans changement d'architecture.
- **Fichiers concernés** : `src/lib/observability/metrics-service.ts`
  (nouveau), `src/lib/observability/api-metrics.ts` (nouveau),
  `src/app/(app)/settings/metrics/page.tsx` (nouveau),
  `src/app/api/settings/metrics/route.ts` (nouveau), migration Prisma
  (`ApiRequestMetric`).
- **Complexité** : Moyenne.
- **Tests nécessaires** : les compteurs reflètent des évènements simulés
  connus (coût IA, échec d'email, latence enregistrée) ; isolation
  multi-tenant des métriques.

### AR-0050 — `AnthropicAIProvider` (`src/lib/ai/`, distinct de l'abstraction LLM du Framework des Agents)
- **Description** : implémentation réelle de `AIProvider` (couche
  historique `src/lib/ai/`, utilisée par `analyzeLead`/`generateMessage`/
  `sequence-engine.ts` — toujours active, PAS remplacée par l'abstraction
  LLM du Framework des Agents qui dessert un périmètre différent) basée
  sur l'API Anthropic (Claude), via `fetch()` direct, sélectionnable par
  `AI_PROVIDER=anthropic`. Échoue explicitement sans `ANTHROPIC_API_KEY`.
- **Fichiers concernés** : `src/lib/ai/providers/anthropic.ts` (nouveau),
  `src/lib/ai/index.ts`.
- **Complexité** : Moyenne.
- **Tests nécessaires** : contrat `AIProvider` (mêmes tests que
  `DemoAIProvider`) + appel réel vérifié contre un vrai serveur HTTP
  local ; échec explicite sans clé API.

### AR-0051 — Quota IA dur par organisation
- **Description** : transforme `AIRequest.estimatedCostUsd` (simple
  journalisation) en quota bloquant mensuel, configurable par
  organisation (`Organization.aiMonthlyBudgetUsd`, additif), avec message
  d'erreur explicite au dépassement — vérifié avant tout nouvel appel
  IA réel (couche `src/lib/ai/` ET Framework des Agents).
- **Fichiers concernés** : `src/lib/ai/quota.ts` (nouveau), `src/lib/ai/index.ts`,
  `src/lib/agents/llm/index.ts`, migration Prisma (`Organization.aiMonthlyBudgetUsd`).
- **Complexité** : Moyenne.
- **Prérequis** : AR-0050.
- **Tests nécessaires** : une organisation au quota atteint est bloquée
  (jamais seulement avertie) ; isolation multi-tenant du quota.

### AR-0052 — `SmtpEmailProvider` — déjà livrée via AR-0145 (v0.9)
Voir `src/lib/email/providers/smtp.ts` (task #86, v0.9) — implémentation
SMTP réelle, configuration par organisation. Rien à faire ici.

### AR-0053 — `GmailApiProvider`
- **Description** : implémentation réelle de `EmailProvider` via l'API
  Gmail (OAuth2 + REST `fetch()` direct — même patron que Google
  Calendar, task #87), configuration par organisation
  (`Integration.config`, kind EMAIL, `provider: "gmail"`). Échoue
  explicitement sans connexion OAuth.
- **Fichiers concernés** : `src/lib/email/providers/gmail.ts` (nouveau),
  `src/lib/email/index.ts`, routes OAuth
  `src/app/api/email/gmail/{connect,callback}/route.ts`.
- **Complexité** : Élevée.
- **Prérequis** : AR-0052 (patron `EmailProvider`, déjà livré).
- **Tests nécessaires** : contrat `EmailProvider` + flux OAuth/envoi
  réel vérifié contre un vrai serveur HTTP local (comme Google
  Calendar) — la vérification de bout en bout contre un vrai compte
  Gmail n'est pas possible dans cet environnement (aucun identifiant).

### AR-0054 — `OutlookApiProvider`
- **Description** : équivalent AR-0053 pour Microsoft Graph/Outlook
  (OAuth2 + REST `fetch()` direct).
- **Fichiers concernés** : `src/lib/email/providers/outlook.ts` (nouveau),
  `src/lib/email/index.ts`, routes OAuth
  `src/app/api/email/outlook/{connect,callback}/route.ts`.
- **Complexité** : Élevée.
- **Prérequis** : AR-0052.
- **Tests nécessaires** : idem AR-0053.

**Total estimé v0.9 bis : ~14 jours de travail restant** (AR-0047/AR-0052 déjà livrées ; AR-0053/AR-0054 parallélisables).

---

## Version 0.10 — Sécurité avancée (MOD-17, porte obligatoire avant v1.0)

### AR-0055 — Suite exhaustive de tests d'isolation multi-tenant
- **Description** : généraliser le gabarit AR-0004 à *toutes* les routes de
  `src/app/api/**` (une entrée de test par route), pas seulement `leads`.
- **Fichiers concernés** : `tests/tenant-isolation/**` (extension
  complète).
- **Complexité** : Élevée.
- **Estimation** : 4 jours.
- **Prérequis** : AR-0004, l'ensemble des modules précédents livrés.
- **Tests nécessaires** : c'est la tâche de test elle-même ; critère de
  réussite = 100 % des routes couvertes.

### AR-0056 — Revue de sécurité OWASP Top 10
- **Description** : revue manuelle structurée (injection, auth cassée,
  exposition de données sensibles, contrôle d'accès, mauvaise
  configuration, etc.) sur l'ensemble de l'application, avec rapport écrit
  et plan de correction des constats.
- **Fichiers concernés** : `docs/security/owasp-review-<date>.md`
  (nouveau), correctifs variables selon constats.
- **Complexité** : Élevée.
- **Estimation** : 3 jours (revue) + variable (correctifs).
- **Prérequis** : AR-0055.
- **Tests nécessaires** : chaque constat corrigé doit avoir un test de
  non-régression associé.

### AR-0057 — Quota email dur par organisation
- **Description** : généraliser le principe du quota IA (AR-0051) à
  l'envoi d'email (au-delà du `dailySendLimit` déjà existant, le rendre
  strictement bloquant et testé).
- **Fichiers concernés** : `src/lib/email/index.ts`, `src/lib/quota.ts`.
- **Complexité** : Faible.
- **Estimation** : 1 jour.
- **Prérequis** : AR-0051.
- **Tests nécessaires** : test de dépassement bloquant.

### AR-0058 — Préparation 2FA (schéma + interface, sans activation forcée)
- **Description** : ajouter le modèle de données et l'interface
  nécessaires à une future activation 2FA (TOTP) par utilisateur, sans
  encore la rendre obligatoire — pose les fondations pour `MOD-17`
  post-v1.0.
- **Fichiers concernés** : `prisma/schema.prisma` (champ `twoFactorSecret`
  optionnel sur `User`), `src/lib/auth.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0055.
- **Tests nécessaires** : test d'activation/désactivation du 2FA par un
  utilisateur de test, sans impact sur les utilisateurs qui ne l'activent
  pas.

**Total estimé v0.10 : ~10 jours (hors correctifs variables AR-0056).**

---

## Version 1.0 — Ouverture SaaS (MOD-18, MOD-19) — première version stable

### AR-0059 — API publique en lecture (v1)
- **Description** : premières routes `api/public/v1/**` en lecture seule
  (prospects, opportunités, factures), authentifiées par clé API scopée à
  une organisation, documentées en OpenAPI.
- **Fichiers concernés** : `src/app/api/public/v1/**` (nouveau),
  `docs/api/openapi.yaml` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0055, AR-0056.
- **Tests nécessaires** : test qu'une clé API d'une organisation ne peut
  accéder qu'à ses propres données (réutilise le gabarit AR-0004).

### AR-0060 — Rate limiting de l'API publique
- **Description** : limitation de débit par clé API (fenêtre glissante),
  réponse `429` explicite au dépassement.
- **Fichiers concernés** : `src/lib/rate-limit.ts` (nouveau),
  `src/proxy.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0059.
- **Tests nécessaires** : test qu'un dépassement de débit renvoie bien 429
  au bon seuil.

### AR-0061 — Webhooks sortants
- **Description** : événements sortants (prospect créé, devis accepté,
  facture payée) livrés à une URL configurée par l'organisation, avec
  retry et signature HMAC (même pattern que `unsubscribe-token.ts`).
- **Fichiers concernés** : `src/lib/webhooks-outbound.ts` (nouveau),
  job dédié (`src/lib/jobs/webhook-delivery-job.ts`).
- **Complexité** : Élevée.
- **Estimation** : 2,5 jours.
- **Prérequis** : AR-0040 (jobs), AR-0059.
- **Tests nécessaires** : test de livraison avec retry sur échec simulé du
  côté récepteur.

### AR-0062 — Modèle de plans d'abonnement
- **Description** : table `Plan` (Starter/Pro/Entreprise) avec quotas
  associés (utilisateurs, volume IA/email), liée à `Organization`.
- **Fichiers concernés** : `prisma/schema.prisma`, migration associée.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0051, AR-0057.
- **Tests nécessaires** : test qu'un changement de plan applique
  immédiatement les nouveaux quotas.

### AR-0063 — Intégration Stripe Billing (abonnement récurrent)
- **Description** : souscription/upgrade/downgrade de plan via Stripe
  Billing, réutilisant `PaymentProvider`/webhook Stripe déjà en place
  (AR-0027, AR-0028) pour la partie abonnement plutôt que paiement
  ponctuel.
- **Fichiers concernés** : `src/lib/billing/stripe-subscription.ts`
  (nouveau), `src/app/api/billing/**` (nouveau).
- **Complexité** : Très élevée.
- **Estimation** : 4 jours.
- **Prérequis** : AR-0062, AR-0027.
- **Tests nécessaires** : test de changement de plan, test d'échec de
  paiement d'abonnement (passage en statut restreint, pas de suppression
  de données).

### AR-0064 — Onboarding self-service
- **Description** : parcours d'inscription publique complet : création de
  compte + organisation, choix du vertical de départ (Provence 360,
  vertical fictif, ou generic), choix du plan, paiement, provisionnement
  automatique — sans intervention manuelle.
- **Fichiers concernés** : `src/app/(auth)/register/**` (extension),
  `src/lib/bootstrap.ts`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0013, AR-0063.
- **Tests nécessaires** : test e2e complet du parcours d'inscription à
  l'organisation fonctionnelle.

### AR-0065 — Page de gestion d'abonnement
- **Description** : page permettant à un administrateur d'organisation de
  consulter son plan, changer de plan, voir sa consommation de quota en
  temps réel.
- **Fichiers concernés** : `src/app/(app)/settings/billing/page.tsx`
  (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0062, AR-0063.
- **Tests nécessaires** : test d'affichage de consommation cohérent avec
  les quotas réels.

### AR-0066 — Recette finale de version stable
- **Description** : passage complet du golden path (Provence 360 + vertical
  fictif) + du parcours onboarding self-service + de la suite d'isolation
  multi-tenant (AR-0055) sur un environnement de préproduction identique à
  la production visée.
- **Fichiers concernés** : aucun (recette), rapport
  `docs/release/v1.0-recette.md` (nouveau).
- **Complexité** : Élevée.
- **Estimation** : 2 jours.
- **Prérequis** : toutes les tâches précédentes de v1.0.
- **Tests nécessaires** : c'est la tâche de test elle-même.

**Total estimé v1.0 : ~19,5 jours.**

---

## Récapitulatif des charges par version

| Version | Total estimé (dév. senior, jours) |
|---|---|
| v0.1 | ~4 |
| v0.2 | ~14,5 |
| v0.3 | ~12 |
| v0.4 | ~7 |
| v0.5 | ~6 |
| v0.6 | ~7 |
| v0.7 | ~12 (≈8 si parallélisé) |
| v0.8 | ~12,5 |
| v0.9 | ~18,5 (parallélisable partiellement) |
| v0.10 | ~10 (+ correctifs variables) |
| v1.0 | ~19,5 |
| **Total v0.1 → v1.0** | **~123 jours** (un développeur senior à temps plein, hors aléas et correctifs de sécurité variables) |

Ces estimations sont indicatives (planification, pas engagement) et à
recalibrer une fois `MOD-02` (v0.2) livré, module qui conditionne la
difficulté réelle de tout le reste.

Ce tableau reflète le plan initial de ce document. En pratique, `v0.2`
(~13 jours réels) a livré `MOD-21` à la place de `MOD-02`, `v0.3`
(~13,5 jours réels) a livré `MOD-22` (Framework des Agents) à la place de
`MOD-20`, `v0.4` (~11,5 jours réels) a livré `MOD-23` (Agent Director) à
la place de `MOD-12` partie 1, `v0.5` (~12 jours réels) a livré
`MOD-24` (Agent Commercial) à la place de `MOD-12` partie 2, `v0.6`
(~15,5 jours réels) a livré `MOD-25` (Workflow Engine) à la place de
`MOD-13`, `v0.7` (~18,5 jours réels) a livré `MOD-26` (intelligence
documentaire) à la place de `MOD-14`, et `v0.8` (~26,5 jours réels) a livré
`MOD-27` (Automation Engine Enterprise) — qui délivre entièrement le
périmètre technique de `MOD-15` — à la place de la migration initialement
prévue de `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/`MOD-14` vers ce noyau — voir
les sections « Total estimé du travail réellement livré » correspondantes
ci-dessus.

---

*Voir `MILESTONES.md` pour les critères de sortie détaillés de chaque
version et `DEVELOPMENT_GUIDE.md` pour les modalités concrètes
d'exécution de ces tâches.*
