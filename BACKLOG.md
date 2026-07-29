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

## Version 0.3 — Validation par un 2ᵉ vertical fictif (MOD-20) + ajustements

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

## Version 0.4 — Facturation client final, socle (MOD-12 partie 1)

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

## Version 0.5 — Facturation, paiement Stripe réel (MOD-12 partie 2)

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

## Version 0.6 — Gestion documentaire (MOD-13)

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

## Version 0.7 — Calendrier (MOD-14)

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

**Total estimé v0.7 : ~12 jours** (AR-0038/AR-0039 parallélisables entre
deux développeurs si disponibles → ~8 jours calendaires).

---

## Version 0.8 — Infrastructure asynchrone (MOD-15)

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

**Total estimé v0.8 : ~12,5 jours.**

---

## Version 0.9 — Observabilité + connecteurs réels (MOD-16, MOD-04, MOD-06)

### AR-0047 — Logs structurés (pino)
- **Description** : remplacer les `console.log` restants par des logs
  structurés, avec politique explicite de champs autorisés (aucune donnée
  sensible : mot de passe, token, contenu brut de prompt IA en clair sans
  troncature).
- **Fichiers concernés** : `src/lib/logger.ts` (nouveau), remplacement
  progressif dans `src/lib/**`.
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0006.
- **Tests nécessaires** : test qu'aucun champ sensible listé n'apparaît
  dans un log généré en test.

### AR-0048 — Capture d'erreurs (Sentry ou équivalent)
- **Description** : intégration d'un service de capture d'erreurs
  applicatives avec contexte suffisant (route, organisation anonymisée,
  stack trace).
- **Fichiers concernés** : `src/lib/error-tracking.ts` (nouveau),
  `next.config.ts`.
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0047.
- **Tests nécessaires** : test qu'une exception simulée est bien capturée
  en environnement de test.

### AR-0049 — Métriques de base
- **Description** : compteurs/latences exposés (latence API moyenne, taux
  d'échec d'envoi email, coût IA cumulé par organisation) consultables au
  minimum via une page d'administration interne.
- **Fichiers concernés** : `src/lib/metrics.ts` (nouveau),
  `src/app/(app)/settings/metrics/page.tsx` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 2 jours.
- **Prérequis** : AR-0047.
- **Tests nécessaires** : test que les compteurs reflètent des événements
  simulés connus.

### AR-0050 — `AnthropicAIProvider`
- **Description** : implémentation réelle de `AIProvider` basée sur l'API
  Anthropic (Claude), sélectionnable par `AI_PROVIDER=anthropic`, clé API
  strictement côté serveur.
- **Fichiers concernés** : `src/lib/ai/anthropic-provider.ts` (nouveau),
  `src/lib/ai/index.ts`.
- **Complexité** : Élevée.
- **Estimation** : 3 jours.
- **Prérequis** : AR-0043 (appels IA déjà asynchrones).
- **Tests nécessaires** : tests de contrat `AIProvider` (déjà définis pour
  `DemoAIProvider`) rejoués contre l'implémentation réelle avec des
  doubles de test pour l'appel réseau.

### AR-0051 — Quota IA dur par organisation
- **Description** : transformer `AIRequest.estimatedCostUsd` (simple
  journalisation aujourd'hui) en quota bloquant, configurable par
  organisation, avec message d'erreur explicite au dépassement.
- **Fichiers concernés** : `src/lib/ai/index.ts`,
  `src/lib/quota.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0050.
- **Tests nécessaires** : test qu'une organisation au quota atteint est
  bloquée, pas seulement avertie.

### AR-0052 — `SmtpEmailProvider`
- **Description** : implémentation SMTP générique de `EmailProvider`
  (premier connecteur réel, le plus simple avant Gmail/Outlook).
- **Fichiers concernés** : `src/lib/email/smtp-provider.ts` (nouveau).
- **Complexité** : Moyenne.
- **Estimation** : 1,5 jour.
- **Prérequis** : AR-0042.
- **Tests nécessaires** : tests de contrat `EmailProvider` + test manuel
  documenté sur un compte SMTP de test.

### AR-0053 — `GmailApiProvider`
- **Description** : implémentation Gmail API (OAuth) de `EmailProvider`.
- **Fichiers concernés** : `src/lib/email/gmail-provider.ts` (nouveau).
- **Complexité** : Très élevée.
- **Estimation** : 3,5 jours.
- **Prérequis** : AR-0052.
- **Tests nécessaires** : tests de contrat + test manuel documenté (OAuth
  non simulable simplement en CI).

### AR-0054 — `OutlookApiProvider`
- **Description** : équivalent AR-0053 pour Microsoft Graph/Outlook.
- **Fichiers concernés** : `src/lib/email/outlook-provider.ts` (nouveau).
- **Complexité** : Très élevée.
- **Estimation** : 3,5 jours.
- **Prérequis** : AR-0052.
- **Tests nécessaires** : idem AR-0053.

**Total estimé v0.9 : ~18,5 jours** (AR-0053/AR-0054 parallélisables).

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

---

*Voir `MILESTONES.md` pour les critères de sortie détaillés de chaque
version et `DEVELOPMENT_GUIDE.md` pour les modalités concrètes
d'exécution de ces tâches.*
