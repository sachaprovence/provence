# Provence 360 — Architecture technique

## 1. Stack

- **Next.js 16** (App Router, TypeScript strict) — pages en Server Components,
  mutations via Route Handlers (`src/app/api/**`) appelées par de petits
  composants clients ("îlots" interactifs).
- **PostgreSQL 16 + Prisma ORM 7** (driver adapter `@prisma/adapter-pg`,
  client généré dans `src/generated/prisma`, non versionné).
- **Tailwind CSS v4** pour le design (palette Provence définie dans
  `src/app/globals.css`).
- **Zod** pour la validation de toutes les entrées API.
- **bcryptjs** pour le hachage des mots de passe, sessions maison stockées en
  base (table `Session`, cookie httpOnly).
- **Vitest** pour les tests unitaires, un script Playwright pour un test de
  bout en bout du parcours principal.
- **Recharts** pour les graphiques du tableau de bord/statistiques.

Aucune dépendance payante n'est requise : tout fonctionne en mode démo
(fournisseurs IA et email simulés, voir §4).

## 2. Arborescence (résumé)

```
prisma/
  schema.prisma        Modèle de données complet
  migrations/           Migrations SQL
  seed.ts               Données de démonstration
src/
  app/
    (auth)/             Connexion, inscription, réinitialisation (public)
    (app)/               Application authentifiée (sidebar + pages)
      dashboard/ leads/ pipeline/ campaigns/ sequences/ inbox/ tasks/
      appointments/ quotes/ missions/ map/ stats/ settings/ users/ onboarding/
    api/                 Route Handlers (toutes les mutations et lectures API)
    unsubscribe/[token]/ Page publique de désinscription
  components/            Composants React (dont les "îlots" clients)
  lib/
    auth.ts              Sessions, hachage, RBAC
    permissions.ts        Règles d'accès par rôle / territoire
    prisma.ts             Client Prisma (driver adapter pg)
    scoring.ts             Moteur de scoring configurable
    sequence-engine.ts      Moteur de séquences (envoi, arrêt automatique)
    automation-engine.ts    Moteur de règles internes
    suppression.ts          Liste d'exclusion / désinscription
    ai/                     Interface AIProvider + implémentation démo
    email/                  Interface EmailProvider + implémentation démo
    validations/            Schémas Zod par domaine
  middleware → src/proxy.ts  Garde d'authentification (Next.js 16 : "proxy")
docs/                    Spécification et architecture
tests/                   Tests unitaires (Vitest) et test e2e (Playwright)
```

## 3. Modèle de données

Voir `prisma/schema.prisma` pour le détail complet (relations, index,
contraintes d'unicité). Entités principales, regroupées par domaine :

- **Organisation & accès** : `Organization`, `User`, `Membership` (rôle +
  territoire), `Session`, `PasswordResetToken`, `LoginEvent`.
- **Ciblage** : `Territory`, `IdealCustomerProfile`.
- **Prospection** : `LeadSource`, `Lead`, `LeadContact`, `LeadNote`, `Tag`.
- **Analyse & scoring** : `LeadAnalysis`, `LeadScore`.
- **Campagnes & séquences** : `Campaign`, `Sequence`, `SequenceStep`,
  `Enrollment`.
- **Communication** : `EmailAccount`, `Message`, `EmailEvent`, `Conversation`.
- **Suivi commercial** : `Task`, `Appointment`, `Opportunity`, `Quote`,
  `QuoteLine`, `Service`.
- **Exécution** : `Customer`, `Mission`, `Provider`.
- **Automatisation & conformité** : `AutomationRule`, `Notification`,
  `SuppressionEntry`, `ConsentRecord`, `AuditLog`.
- **IA & intégrations** : `AIRequest`, `Integration`, `WebhookEvent`.

Toutes les entités métier portent `organizationId` avec index composé
`[organizationId, ...]`, et chaque requête serveur filtre explicitement par
l'organisation de l'utilisateur courant (`leadWhereForActor`,
`requireActor()`), ce qui garantit l'isolation multi-tenant.

## 4. Couches d'abstraction fournisseur

### AIProvider (`src/lib/ai/`)

Interface unique (`analyzeLead`, `recommendScore`, `generateMessage`,
`classifyReply`, `summarizeConversation`, `recommendNextAction`, `translate`,
`generateSalesReport`, `estimateCostUsd`). `DemoAIProvider` est une
implémentation déterministe, sans appel réseau, qui distingue explicitement
faits vérifiés / estimés / manquants dans son analyse. Chaque appel réel (en
production) doit être journalisé dans `AIRequest` (prompt, réponse, modèle,
coût estimé, utilisateur, statut de validation) — ce que fait déjà le code
actuel.

Pour brancher un vrai fournisseur : créer `src/lib/ai/<fournisseur>-provider.ts`
implémentant `AIProvider`, puis l'ajouter dans `src/lib/ai/index.ts` selon la
variable d'environnement `AI_PROVIDER`. La clé API doit être lue uniquement
côté serveur (jamais de préfixe `NEXT_PUBLIC_`).

### EmailProvider (`src/lib/email/`)

Interface `send(email): Promise<SendResult>`. `DemoEmailProvider` simule
l'envoi (les emails restent consultables dans la fiche prospect) et simule un
échec pour toute adresse contenant `invalid`/`bounce`, afin de tester le
comportement de repli. Un vrai fournisseur (SMTP, Gmail API, Outlook API)
s'ajoute de la même façon via `EMAIL_PROVIDER`.

## 5. Moteur de séquences

`src/lib/sequence-engine.ts` :

- `enrollLeadInSequence` — vérifie la liste d'exclusion et les doublons avant
  d'inscrire un prospect.
- `processDueSequences` — traite les inscriptions dont `nextRunAt <= now`,
  génère le message via `AIProvider`, respecte la fenêtre horaire/jours
  autorisés de l'étape, et bascule en validation humaine si requis.
- `sendMessageNow` — envoie réellement (ou simule l'envoi), respecte la
  limite d'envoi quotidienne, revérifie la liste d'exclusion juste avant
  l'envoi (défense en profondeur), puis avance à l'étape suivante.
- `stopEnrollmentsForLead` — arrête toutes les inscriptions actives d'un
  prospect (réponse, RDV, client gagné, adresse invalide, désinscription,
  liste d'exclusion, arrêt manuel).

En local, ce traitement est déclenché soit manuellement (bouton "Traiter les
relances maintenant" en mode démo), soit par un vrai cron système appelant
`POST /api/cron/process-sequences` avec l'en-tête `Authorization: Bearer
<CRON_SECRET>`. Ce choix évite une dépendance à Redis/BullMQ pour le MVP (voir
`docs/01-SPECIFICATION.md` §6).

## 6. Sécurité

- Sessions serveur (table `Session`, cookie httpOnly, `SameSite=Lax`, expiration
  14 jours), mots de passe hachés avec bcrypt.
- Toute route API vérifie l'authentification (`requireActorApi`) puis filtre
  strictement par `organizationId` — aucune requête ne traverse les
  organisations.
- Permissions par rôle (`OWNER_ADMIN`, `SALES`, `PROVIDER`) centralisées dans
  `src/lib/permissions.ts` ; un prestataire ne voit que les prospects/missions
  de son territoire.
- Validation Zod systématique des entrées API.
- Journal d'audit (`AuditLog`) sur les actions sensibles (création/màj de
  prospect, analyse, score, message, validation, désinscription…) et journal
  de connexions (`LoginEvent`) séparé.
- Lien de désinscription signé par HMAC (`AUTH_SECRET`), vérifié en temps
  constant (`crypto.timingSafeEqual`).
- Aucune clé API IA/email n'est exposée au navigateur.

## 7. Fonctionnalités restant à développer après le MVP

Voir `docs/01-SPECIFICATION.md` §5 pour la liste détaillée (connecteurs email
réels, vraie carte interactive, file de traitement distribuée, i18n complète
de l'interface, facturation SaaS, 2FA/SSO, application mobile…).

## 8. Socle technique transverse (fondations Autorun — `ROADMAP.md` MOD-00)

Cette section documente les fondations techniques ajoutées au-dessus du MVP
Provence 360 (sans modifier son comportement fonctionnel), qui serviront de
socle à toute la généralisation ultérieure vers Autorun. Décisions
détaillées dans `docs/adr/`.

### Configuration & démarrage

- `src/lib/env.ts` : schéma Zod validant `process.env` (`DATABASE_URL`,
  `AUTH_SECRET` ≥ 16 caractères, `AI_PROVIDER`, `EMAIL_PROVIDER`,
  `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `LOG_LEVEL`). Accès paresseux
  (`export const env`, `Proxy`) : la validation ne se déclenche qu'à la
  première lecture réelle, jamais à l'import du module — voir ADR 0002.
- `src/instrumentation.ts` : hook `register()` de Next.js, exécuté une fois
  au démarrage d'une instance serveur (jamais pendant `next build`).
  Valide la configuration et journalise le résultat ; une configuration
  invalide empêche le serveur de démarrer plutôt que d'échouer plus tard,
  au hasard d'une requête.

### Journalisation

- `src/lib/logger.ts` : logger structuré (`pino`, JSON), avec redaction
  automatique des champs sensibles (mots de passe, tokens, secrets,
  en-têtes d'autorisation). Pas de transport `pino-pretty` (voir ADR 0003).
  `console.log`/`console.debug`/`console.info` sont interdits dans `src/`
  par ESLint (`no-console`) ; `console.warn`/`console.error` restent
  autorisés pour les error boundaries client (voir plus bas), où le logger
  serveur n'est pas accessible.

### Gestion des erreurs

- `src/lib/errors.ts` : `AppError` et sous-classes (`ValidationError`,
  `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`) +
  `toApiErrorResponse()`, qui journalise systématiquement côté serveur et ne
  renvoie jamais le message brut d'une exception inattendue au client
  (seulement un `incidentId` permettant de retrouver la trace complète dans
  les logs). Additif : les routes API existantes (`src/lib/api-helpers.ts`)
  ne sont pas modifiées ; ce module est le point d'entrée recommandé pour
  tout nouveau code (voir `DEVELOPMENT_GUIDE.md`).
- `src/app/error.tsx` / `src/app/global-error.tsx` / `src/app/(app)/error.tsx`
  : frontières d'erreur Next.js (App Router), qui remontent l'erreur au
  serveur via `POST /api/client-errors` (`src/lib/report-client-error.ts`)
  pour une journalisation centralisée des erreurs côté navigateur.
- `src/app/not-found.tsx`, `src/app/(app)/loading.tsx` : pages spéciales
  Next.js pour le 404 et l'état de chargement de l'espace applicatif (la
  barre latérale reste affichée pendant que le contenu se charge ou en cas
  d'erreur, `(app)/layout.tsx` n'étant pas concerné par ces frontières).

### Composants UI de base

`src/components/ui/` : `Button`, `Input`, `Textarea`, `Select`, `Card`,
`Badge`, `Spinner`, `Skeleton`/`SkeletonText`, `EmptyState`,
`ToastProvider`/`useToast`. S'appuient sur les classes déjà définies dans
`globals.css` (`.btn-primary`, `.input`, `.card`, `.badge`…) plutôt que de
dupliquer le style — objectif : cohérence visuelle, pas un nouveau système
de design parallèle. `ToastProvider` est monté une fois à la racine
(`src/app/layout.tsx`) ; démontré en usage réel sur les pages
d'authentification (`(auth)/login`, `register`, `reset-password`), qui
utilisent désormais ce kit au lieu de balises HTML brutes.

### Contrôle de santé

- `GET /api/health` (public, exclu de l'authentification dans
  `src/proxy.ts`) : vérifie la connectivité base de données
  (`SELECT 1`) et journalise un échec. Utilisé par le `HEALTHCHECK` du
  `Dockerfile` et de `docker-compose.yml`.

### CI/CD

- `.github/workflows/ci.yml` : lint, typecheck (`tsc --noEmit`), tests
  unitaires (avec service PostgreSQL éphémère), build — sur chaque pull
  request et sur `main`.
- `.github/workflows/e2e.yml` : build + démarrage réel + seed + golden
  path (`tests/e2e/golden-path.mjs`) après merge sur `main`.
- `.github/CODEOWNERS` : routage indicatif des revues par domaine.

### Tests d'isolation multi-tenant

- `tests/helpers/tenant-isolation.ts` : gabarit réutilisable
  (`expectNoCrossTenantLeak`) pour vérifier qu'un acteur d'une organisation
  ne voit jamais les ressources d'une autre — à dupliquer pour chaque
  nouveau domaine sensible.
- `tests/tenant-isolation/leads.test.ts` : première application concrète,
  sur le domaine `Lead` déjà existant (isolation par organisation, et par
  territoire pour le rôle `PROVIDER`). Test d'intégration nécessitant une
  vraie base PostgreSQL (`DATABASE_URL`) ; ignoré automatiquement sinon.

### Formatage et lint

- Prettier configuré (`.prettierrc.json`, scripts `format`/`format:check`),
  scopé à `src/**`/`tests/**` — le code métier existant n'a volontairement
  pas été reformaté rétroactivement dans cette phase (voir ADR 0004).
  `eslint-config-prettier` désactive les règles de style ESLint qui
  entreraient en conflit avec Prettier.

### Docker

- `.dockerignore` ajouté (le `Dockerfile` faisait un `COPY . .` sans
  exclusion : risque de copier `.env` dans l'image).
  `HEALTHCHECK` ajouté au `Dockerfile` et à `docker-compose.yml`,
  s'appuyant sur `GET /api/health`.

## 9. Multi-tenant : Organization/Workspace (v0.2 — `ROADMAP.md` MOD-21)

Voir `docs/adr/0005` et `0006` pour la justification complète des choix
ci-dessous.

### Modèle de données

- `Organization` (inchangé) reste la frontière multi-tenant **primaire** :
  toutes les tables métier existantes continuent de filtrer par
  `organizationId`, sans aucune migration sur ces tables.
- `Workspace` (nouveau) : sous-espace de travail au sein d'une
  organisation (`organizationId` FK, `slug` unique par organisation,
  `isDefault`, `archivedAt`). Chaque organisation (Provence 360 comprise)
  possède exactement un workspace par défaut, créé automatiquement à
  l'inscription (`src/app/api/auth/register/route.ts`) et par le seed de
  démonstration (`prisma/seed.ts`).
- `WorkspaceMembership` (nouveau, additif) : appartenance à un workspace,
  avec un rôle parmi `WorkspaceRole` (`OWNER`, `ADMIN`, `MANAGER`,
  `COMMERCIAL`, `OPERATOR`, `ACCOUNTANT`, `SUPPORT`, `VIEWER`) — distinct
  et indépendant de `Membership`/`MembershipRole` (organisation, inchangé,
  toujours utilisé par toutes les routes métier existantes).
- `WorkspaceInvitation` (nouveau) : invitation par email avec jeton,
  expiration et statut ; l'acceptation crée le compte si nécessaire, une
  `Membership` d'organisation (rôle mappé, voir ADR 0006) si absente, et
  la `WorkspaceMembership`.
- `Lead.workspaceId` (nouveau, nullable) : première preuve de concept du
  scoping par workspace sur une table métier existante. Les autres tables
  métier restent scopées par `organizationId` seul pour l'instant.
- `Session.activeWorkspaceId` (nouveau, nullable) : workspace actif de la
  session, stocké côté serveur — jamais un identifiant fourni tel quel par
  le client.

### Isolation des données — principe non négociable

**Aucune route ne fait confiance à un `organizationId`/`workspaceId`
transmis par le client.** Concrètement :

- `src/lib/workspace-service.ts` : `resolveWorkspaceOrThrow(actor,
  workspaceId)` refiltre systématiquement par `actor.organization.id` ;
  un `workspaceId` d'une autre organisation renvoie une `NotFoundError`
  (jamais une erreur qui confirmerait l'existence de la ressource à un
  tiers non autorisé).
- `src/lib/workspace-context.ts` : `setActiveWorkspace(actor,
  workspaceId)` revérifie l'existence d'une `WorkspaceMembership` réelle
  avant d'écrire `Session.activeWorkspaceId` ; tout refus est journalisé
  (`access.denied`).
- `src/lib/workspace-context.ts` : `requireWorkspacePermission(actor,
  permission)` vérifie la permission du rôle de workspace de l'acteur
  avant toute action sensible, et journalise systématiquement un refus.

### Rôles et permissions

`src/lib/workspace-permissions.ts` définit une matrice
rôle → permissions (`MANAGE_WORKSPACE`, `MANAGE_MEMBERS`,
`MANAGE_LEADS`, `VALIDATE_MESSAGES`, `MANAGE_FINANCE`,
`EXECUTE_MISSIONS`, `VIEW_WORKSPACE`), avec des libellés français pour
l'affichage. Le mapping de migration `MembershipRole` → `WorkspaceRole`
(`OWNER_ADMIN` → `OWNER`, `SALES` → `COMMERCIAL`, `PROVIDER` →
`OPERATOR`) est implémenté dans
`workspaceRoleToLegacyMembershipRole`/la migration SQL, et documenté en
ADR 0006.

### Audit

Tous les événements suivants sont journalisés via `writeAuditLog`
(`src/lib/audit.ts`, inchangé) avec des noms d'action constants
(`src/lib/workspace-permissions.ts`, `WORKSPACE_AUDIT_ACTIONS`) :
création d'organisation/workspace, mise à jour, archivage, restauration,
invitation, changement de rôle, retrait de membre, changement de
workspace actif, tentative d'accès interdite.

### UI

`src/components/workspace-switcher.tsx` (barre latérale),
`/settings/workspaces` (liste, création, archivage),
`/settings/workspaces/[id]/members` (membres, invitation, rôle, retrait),
`/workspace-invitations/[token]` (acceptation, page publique).

### Tests

`tests/tenant-isolation/workspaces.test.ts` (isolation inter-workspace,
falsification, permissions, changement de rôle, archivage),
`tests/tenant-isolation/workspace-lifecycle.test.ts` (création,
invitation/acceptation, retrait), `tests/workspace-migration.test.ts`
(invariants de migration sur données réelles), et
`tests/e2e/two-organizations-isolation.mjs` (Playwright, deux
organisations/deux utilisateurs).

## 10. Framework des Agents IA (v0.3 — `ROADMAP.md` MOD-22)

Voir `docs/adr/0007`, `0008` et `0009` pour la justification complète des
choix ci-dessous. **Cette phase ne livre aucun agent métier** — uniquement
l'infrastructure commune que tout futur agent (Commercial, CRM, Marketing,
Comptabilité, Support, Analyse, Directeur, etc.) devra utiliser sans
exception. Le seul « agent » concret livré est un agent de diagnostic
non-métier (`system.diagnostic-agent`) servant à valider le framework de
bout en bout.

### Architecture à deux niveaux : définition vs installation

- `AgentDefinition` : blueprint de catalogue (global si `organizationId`
  est `null`, ou propre à une organisation), **sans code exécutable** —
  identifiant (`key`), nom, description, version, statut (`DRAFT` /
  `PUBLISHED` / `DEPRECATED` / `ARCHIVED`), auteur, catégorie, icône,
  `runtimeKey` (clé vers le registre de runtimes), `configSchema`,
  `declaredToolKeys`, `declaredPermissions`, `compatibleAiModels`,
  `defaultLimits`. Contrainte `@@unique([organizationId, key])`.
- `AgentInstallation` : instance réelle au sein d'un workspace précis
  (`organizationId` + `workspaceId` toujours requis), avec ses propres
  `grantedToolKeys`/`grantedPermissions`/`usageLimits`/`config` — toujours
  un **sous-ensemble plafonné** de ce que la définition déclare. Statut
  (`INSTALLED` / `ACTIVE` / `INACTIVE` / `SUSPENDED` / `UNINSTALLED`).
  Contrainte `@@unique([workspaceId, definitionId])` (un agent ne peut être
  installé qu'une fois par workspace).
- **Principe de moindre privilège** (`src/lib/agents/permissions.ts`,
  `assertGrantsWithinDeclaredCeiling`) : les droits accordés à une
  installation ne peuvent jamais dépasser (a) ce que la définition
  déclare, ET (b) ce que le rôle de workspace de l'acteur humain qui
  installe/modifie autorise lui-même (réutilise `hasWorkspacePermission`
  et le type `WorkspacePermission` de la §9 — aucun système de permission
  parallèle).

### Registres en mémoire (runtimes, outils)

Même motif pour les deux : une `Map<string, T>` peuplée par
`registerAgentRuntime`/`registerToolHandler`, jamais recréée — `Map.set`
écrase plutôt que de lever une erreur, ce qui rend l'enregistrement
idempotent et compatible avec le HMR Turbopack en développement.
`src/instrumentation.ts` (`register()`) appelle cet enregistrement une
fois au démarrage du serveur, mais **ce n'est pas la seule garantie** :
`execution-engine.ts#executeAgentRun` rappelle lui-même
`registerBuiltInAgentComponents()` de façon défensive avant toute
résolution, car Next.js peut charger ce module dans un contexte
d'exécution distinct de celui d'`instrumentation.ts` — un défaut réel
découvert et corrigé en v0.4 (voir ADR 0013), qui affectait silencieusement
tout agent (diagnostic compris) en production depuis v0.3.

- `src/lib/agents/registry.ts` : `registerAgentRuntime`/`getAgentRuntime`
  — `AgentDefinition.runtimeKey` résout vers un `AgentRuntime` (interface
  `{ runtimeKey, execute(context) }`).
- `src/lib/agents/tool-registry.ts` : `registerToolHandler`/
  `getToolHandler` — `AgentTool.key` résout vers un `ToolHandler`
  (interface `{ key, handle(input) }`). Un seul registre pour tous les
  outils de tous les agents — ajouter un outil ne touche jamais le moteur
  d'exécution.

### Moteur d'exécution (file interne PostgreSQL)

`src/lib/agents/execution-engine.ts` reprend exactement le motif déjà en
production de `src/lib/sequence-engine.ts` (`processDueSequences`) plutôt
que d'introduire une dépendance externe (`pg-boss`) dès maintenant — voir
ADR 0008 pour la justification et le plan de bascule (`MOD-15`
remplacera l'implémentation interne sans changer l'API publique du
moteur).

- `createAgentRun` crée un `AgentRun` (`status=QUEUED`, priorité, entrée,
  `timeoutMs`, `maxAttempts`, planification différée via `scheduledAt`).
- `processQueuedAgentRuns(now)` (appelée par
  `POST /api/cron/process-agent-runs`) sélectionne les runs dus, triés par
  priorité décroissante puis `scheduledAt` croissant, et les traite un par
  un avec `try/catch`.
- `executeAgentRun(runId)` : passe le run en `RUNNING`, incrémente
  `attempt`, vérifie que l'installation est `ACTIVE` (sinon échec
  immédiat), résout le runtime, construit un `AgentExecutionContext`
  (`callTool` qui vérifie la permission d'outil **avant** d'invoquer le
  handler, `log`), exécute sous `withTimeout` (`Promise.race` contre un
  rejet de timeout). En cas d'échec : nouvelle tentative planifiée si
  `attempt < maxAttempts`, sinon `FAILED` (erreur) ou `TIMED_OUT`
  (dépassement de délai). Chaque étape écrit un `AgentRunLog`.
- `cancelAgentRun(runId)` : uniquement depuis `QUEUED`/`RUNNING` — refuse
  (`ValidationError`) toute annulation d'un run déjà terminé.

### Mémoire (temporaire, persistante, partagée)

Une seule table `AgentMemoryEntry` avec un discriminant `scope`
(`AgentMemoryScope` : `SHORT_TERM` / `PERSISTENT` / `SHARED`) plutôt que
trois tables séparées — voir ADR 0009. `SHORT_TERM` et `PERSISTENT`
exigent un `installationId` (mémoire propre à une installation) ;
`SHARED` exige `installationId = null` (mémoire visible à tout le
workspace). Un champ `embedding: Json?` est réservé pour une future
vectorisation, **sans fournisseur externe intégré à ce stade**.

`src/lib/agents/memory.ts` expose `setMemory` comme unique point
d'écriture : recherche l'entrée existante (`workspaceId` +
`installationId` + `scope` + `key`) puis met à jour ou crée — **jamais un
simple `upsert`**, car une contrainte d'unicité SQL ne peut pas distinguer
plusieurs lignes où `installationId` vaut `NULL` (limitation documentée
également pour `AgentDefinition.organizationId` ci-dessus). `getMemory`
renvoie `null` si l'entrée est expirée (`expiresAt`) ; `clearExpiredMemory`
purge les entrées expirées.

### Communication et interventions

`src/lib/agents/messaging.ts` : `sendAgentMessage` historise chaque
message (`AgentMessage` : type `TASK_REQUEST` / `TASK_RESPONSE` /
`RESULT` / `ERROR` / `INTERVENTION_REQUEST` / `INFO`, statut `PENDING` /
`DELIVERED` / `READ` / `ACTIONED`). Un message de type
`INTERVENTION_REQUEST` déclenche automatiquement la création d'une
`AgentInterventionRequest` (demande d'intervention humaine), résolue via
`resolveInterventionRequest` (audit-logué).

### Outils déclaratifs et permissions

`AgentTool` (registre unique, `key` unique, `isBuiltIn`/`isActive`) décrit
chaque outil disponible (base de données, email, calendrier, CRM,
documents, API, recherche, fichiers, génération PDF, etc.) —
`src/lib/agents/bootstrap.ts` (`AGENT_TOOL_CATALOG`) enregistre les
handlers *et* synchronise le catalogue en base
(`syncAgentCatalog`). Chaque appel d'outil par un agent passe par
`requireAgentToolPermission` (`src/lib/agents/permissions.ts`), qui vérifie
que l'outil fait partie de `grantedToolKeys` de l'installation et
journalise systématiquement (`agent.tool_access_denied`) tout refus.
`requireAgentWorkspacePermission` applique le même principe pour les
permissions de type workspace (CRM, finance, etc.), en réutilisant la
matrice `WorkspacePermission` de la §9.

### Scheduler

`src/lib/agents/scheduler.ts` : `AgentSchedule` (`ONE_OFF` / `RECURRING` /
`EVENT`), `createSchedule` valide les champs requis par type
(`.refine()` Zod). `processDueAgentSchedules(now)` (appelée par
`POST /api/cron/process-agent-schedules`) déclenche un `AgentRun` pour
chaque planification due dont l'installation est `ACTIVE` (sinon
ignorée), désactive les planifications `ONE_OFF` après exécution.
**Limite connue** : la replanification `RECURRING` utilise un décalage
fixe de +1 heure plutôt qu'une évaluation cron réelle — documenté comme
tel, à lever avant qu'un agent récurrent réel en dépende.
`triggerEventSchedules(eventKey, input?)` déclenche les planifications de
type `EVENT` correspondantes.

### Observabilité et coût IA

`src/lib/agents/observability.ts` : `getInstallationStats` agrège les
statuts de run (`groupBy`), la durée moyenne d'exécution (requête SQL
brute), et le coût IA en réutilisant le modèle `AIRequest` existant via
un nouveau champ nullable `AIRequest.agentRunId` — **aucune nouvelle
table de coût** n'a été créée, le coût des appels IA déclenchés par un
agent est simplement rattaché à son run. `listRunLogs`/
`listRunsForInstallation` complètent l'historique.

### Interface d'administration

`/settings/agents` (catalogue + installations du workspace actif) et
`/settings/agents/[id]` (détail : configuration, permissions, outils
accordés, statistiques via `StatTile` réutilisé, historique des runs,
journaux), réservées aux rôles Owner/Admin (`src/components/nav-config.ts`).

### Tests

`tests/agents/installation-lifecycle.test.ts` (cycle de vie complet,
plafond de droits), `tests/agents/execution-engine.test.ts` (succès,
refus d'outil, timeout, reprise/échec, annulation, installation non
active), `tests/agents/memory-messaging-scheduler.test.ts` (mémoire,
communication, planification), et
`tests/tenant-isolation/agents.test.ts` (isolation multi-tenant complète
+ falsification d'identifiant).

## 11. Agent Director — premier agent orchestrateur (v0.4 — `ROADMAP.md` MOD-23)

Voir `docs/adr/0010`, `0011`, `0012` et `0013` pour la justification
complète des choix ci-dessous. Le Director est **un agent comme les
autres** : une `AgentDefinition`/`AgentInstallation` (§10), exécuté par le
même `executeAgentRun` — aucun raccourci, aucun code spécifique en dehors
du Framework des Agents. **Il ne réalise jamais lui-même de tâche
métier** : il décide, décompose, délègue, attend, fusionne.

### Plan d'exécution : `AgentPlan` / `AgentPlanStep`

Deux modèles additifs, génériques (utilisables par tout futur agent
orchestrateur, pas seulement le Director) :

- `AgentPlan` : une demande décomposée, propriété d'une installation
  orchestratrice (`installationId`), reliée 1:1 à l'`AgentRun` qui l'a
  produite (`runId`, `@@unique`). Statut `DRAFT`/`RUNNING`/`SUCCEEDED`/
  `FAILED`/`CANCELLED`.
- `AgentPlanStep` : une étape — objectif, cible (`targetInstallationId`
  explicite ou `targetCategory` à résoudre dynamiquement), priorité,
  dépendances (`dependsOnStepIds`, référence d'autres étapes du même
  plan), outils/permissions requis, statut, horodatages, durée
  (`durationMs`), résultat/erreur, et `subRunId` (l'`AgentRun` réellement
  créé pour l'agent délégué, 1:1).

`src/lib/agents/director/planning-engine.ts` : `createPlan` valide le DAG
à la création — une étape ne peut dépendre (`dependsOn`, un index dans le
même tableau) que d'une étape qui la précède, ce qui exclut trivialement
tout cycle. `getReadySteps` renvoie les étapes dont toutes les dépendances
ont `SUCCEEDED` et fait basculer en cascade en `SKIPPED` toute étape dont
une dépendance a échoué/a été annulée — le mécanisme qui garantit que la
boucle du Director termine toujours. `mergePlanResults` fusionne les
résultats de toutes les étapes.

### Moteur de délégation

`src/lib/agents/director/delegation-engine.ts` — appeler, attendre,
annuler, relancer un agent, sans jamais réimplémenter l'exécution
elle-même :

- `delegateStep` résout l'agent cible (par id ou par catégorie), vérifie
  qu'il détient les outils/permissions requis par l'étape, crée son
  `AgentRun` (`trigger=AGENT`, valeur d'enum ajoutée en v0.4) et **pilote
  lui-même, de façon synchrone, son exécution jusqu'à un statut terminal**
  (`driveRunToCompletion`, voir ADR 0010) — sans attendre le délai de
  recul de 30 s de la file générique (v0.3). N'échoue jamais par
  exception : un échec de résolution/permission/exécution est toujours
  capturé dans `step.error`, jamais propagé, pour que les autres étapes
  indépendantes du plan continuent.
- `cancelStepDelegation`/`retryStepDelegation` : annulation (réutilise
  `cancelAgentRun`, v0.3) et relance délibérée (nouveau `AgentRun`, relié
  au précédent via `AgentRun.parentRunId` — champ du schéma v0.3
  jusqu'ici inutilisé, la reprise automatique interne à un run réutilisant
  la même ligne).
- Exposé à l'exécution du Director exclusivement via 4 outils du registre
  (`src/lib/agents/tools/director-tools.ts` : `director.list_agents`,
  `director.delegate_task`, `director.cancel_task`, `director.retry_task`)
  — jamais un appel direct depuis le runtime, pour que chaque délégation
  passe par la même vérification de permission
  (`requireAgentToolPermission`) que n'importe quel autre outil. Chaque
  outil vérifie en plus que l'étape appartient bien au plan de
  l'installation appelante (`loadOwnedStep`) — un agent ne peut jamais
  piloter les étapes du plan d'un autre.

### Décomposition de l'objectif

`src/lib/agents/director/decomposition.ts` — heuristique de
correspondance de mots-clés (catégorie puis nom d'agent dans le texte de
l'objectif), explicitement **pas** une compréhension du langage naturel
(voir ADR 0011). Le point d'extension pour une vraie décomposition
(NLU/LLM) est `directorRequestSchema.steps`
(`src/lib/validations/director.ts`) : des étapes structurées fournies
explicitement court-circuitent entièrement l'heuristique, sans toucher au
moteur de planification/délégation.

### Mémoire du Director

`src/lib/agents/director/memory-helpers.ts` — construite entièrement sur
`setMemory`/`getMemory` (v0.3, portée `PERSISTENT`), sans nouvelle table :
conversation (liste plafonnée des tours), décisions, préférences
utilisateur (fusionnées, jamais remplacées), contexte de travail
(remplacé), résumés de run. Compatible avec la vectorisation future de la
mémoire d'agent (champ `embedding` réservé, v0.3, ADR 0009).

### Tableau de bord et visualisation

`src/lib/agents/director/dashboard-service.ts` : agents actifs, tâches
par statut, file d'exécution, planifications actives, historique des
plans, journal des communications, consommation/performance (réutilise et
étend `observability.ts#getWorkspaceAgentStats`, mêmes agrégats que
`getInstallationStats` mais à l'échelle du workspace — sans dupliquer la
logique de calcul). `/settings/director`
(`src/components/director-dashboard-client.tsx`) : KPIs, formulaire de
nouvelle demande, agents actifs, planifications, historique des plans,
journal.

`src/components/director-plan-graph.tsx` : visualisation SVG d'un plan
(Director en racine, étapes disposées par rang de dépendance — une étape
qui dépend d'une autre est toujours à un rang strictement supérieur,
conséquence directe de la validation de DAG à la création), couleur par
statut, arêtes pleines (délégation) et pointillées (dépendance).

### Agents métier futurs : contrats sans implémentation

`src/lib/agents/director/capability-contracts.ts` (types TypeScript +
catalogue `FUTURE_AGENT_CONTRACTS`) et des `AgentDefinition` de statut
`DRAFT` générées depuis ce catalogue (`bootstrap.ts`) pour Commercial,
CRM, Marketing, Support, Analyse, Finance, Développement — **aucune
implémentation, aucun runtime enregistré**, jamais installables (`DRAFT`
refusé par `installAgent`, durcissement v0.4 — voir ADR 0012).

### Tests

`tests/agents/director-planning.test.ts` (validation du DAG, étapes
prêtes, propagation en cascade, fusion), `tests/agents/director-delegation.test.ts`
(délégation réussie/historisée, exécution parallèle et séquentielle,
erreur, timeout, relance avec lignée, annulation, permissions
manquantes, cloisonnement entre orchestrateurs), `tests/agents/director-memory.test.ts`
(conversation plafonnée, décisions, préférences fusionnées, contexte,
résumés de run), et `tests/tenant-isolation/director.test.ts` (isolation
multi-tenant des plans/étapes, falsification d'identifiant).

## 12. Agent Commercial — premier agent métier (v0.5 — `ROADMAP.md` MOD-24)

Voir `docs/adr/0014` à `0017` pour la justification complète des choix
ci-dessous. L'Agent Commercial est **un agent comme les autres** (§10) :
une `AgentDefinition`/`AgentInstallation`, exécutée par le même
`executeAgentRun`, délégable par l'Agent Director (§11) via
`targetCategory: "commercial"` — aucun contournement, aucun code
spécifique en dehors du Framework.

### Modèle de données : générique, pas `Lead`

`CommercialProspect`/`CommercialAction` (délibérément distincts du
`Lead`/`Opportunity`/`Quote` de Provence 360, spécifiques au vertical
photographie 360° — voir ADR 0014) — scopés à une `AgentInstallation`,
même principe que `AgentMemoryEntry`/`AgentPlan`. `CommercialStage` (10
étapes : NEW/TO_QUALIFY/QUALIFIED/FIRST_CONTACT/FOLLOW_UP/MEETING/
QUOTE_SENT/NEGOTIATION/WON/LOST) est le pipeline. `CommercialAction` est
un modèle générique à discriminant `type`
(EMAIL_DRAFT/FOLLOW_UP/QUOTE_DRAFT/PROPOSAL/RECOMMENDATION) plutôt qu'une
table par type — extensible sans migration, système d'approbation
uniforme.

### Moteur de génération LLM générique (`src/lib/agents/llm/`)

Abstraction bas niveau (`LlmProvider.complete(messages) -> texte`),
délibérément distincte de l'`AIProvider` existant de Provence 360
(`src/lib/ai/`, orienté tâches métier structurées — voir ADR 0015).
Registre `Map`-based (même idiome que `registry.ts`/`tool-registry.ts`,
v0.3). Fournisseur actif piloté par `LLM_PROVIDER` (défaut `"demo"`,
déterministe, sans réseau) — jamais un fournisseur choisi en dur. 7
adaptateurs réels (`providers/*.ts` : OpenAI, Anthropic, Google, Mistral,
OpenRouter, Azure, Ollama) effectuent un vrai appel HTTP si les
identifiants requis sont présents dans l'environnement, sinon lèvent une
erreur explicite **au moment de l'appel**, jamais à l'enregistrement —
même principe que les outils `notYetImplemented` (v0.3). Les champs
structurés d'une action (sujet, montant) restent toujours calculés par le
code appelant, jamais extraits du texte généré par analyse.

### Moteur de prompts versionnés (`src/lib/agents/prompts/`)

`PromptTemplate` (`@@unique([key, version])`) : chaque prompt est
versionné (une nouvelle version, jamais une modification en place),
modifiable sans redéploiement, documenté, séparé du code, réutilisable
par n'importe quel agent — voir ADR 0016. `renderPrompt` substitue les
variables déclarées et refuse explicitement toute variable manquante.
Les prompts par défaut du Commercial sont créés une seule fois (version 1)
si la clé n'a encore aucune version (`commercial/prompt-seeds.ts`),
jamais réécrits ensuite.

### Moteur de scoring extensible (`src/lib/agents/commercial/scoring-engine.ts`)

Registre de facteurs pondérés (`registerScoringFactor`), 9 facteurs par
défaut couvrant exactement les critères demandés (taille de l'entreprise,
secteur, présence web, qualité du site, présence Google, présence
réseaux sociaux, historique, potentiel estimé, probabilité de
conversion — poids sommant à 100). Chaque facteur est **heuristique et
déterministe** (pas d'appel IA), dans la continuité de la décomposition du
Director (ADR 0011). `computeScore` ne change jamais pour ajouter un
facteur.

### Les 11 outils déclaratifs et le système d'approbation

`src/lib/agents/tools/commercial-tools.ts` : un outil par capacité
(`commercial.create_prospect`, `search_prospects`, `enrich_prospect`,
`qualify_prospect`, `score_prospect`, `estimate_potential`, `draft_email`,
`draft_followup`, `draft_proposal`, `draft_quote`,
`recommend_next_actions`), chacun vérifié par une permission de workspace
(`MANAGE_LEADS`/`MANAGE_FINANCE`/`VIEW_WORKSPACE`) en plus du plafond
d'outils de l'installation.

`createAction` (`commercial-service.ts`) crée toujours une
`CommercialAction` à `PENDING_APPROVAL`, **sauf** si
`AgentInstallation.config.autonomousMode === true` (architecture prête
pour un mode autonome futur, désactivée par défaut — voir ADR 0017), et
même alors, l'envoi (`sendAction`) reste toujours une étape explicite
distincte : aucune action n'atteint jamais `SENT` automatiquement. Le
pipeline (`CommercialProspect.stage`) ne progresse qu'au moment de
l'envoi réel, jamais à la simple rédaction.

### Mémoire commerciale

Historique/emails/devis/rendez-vous : déjà structurés et interrogeables
directement via `CommercialProspect`/`CommercialAction`, aucune
duplication nécessaire. Préférences/objections (qualitatives) :
`src/lib/agents/commercial/memory.ts`, construit sur `setMemory`/
`getMemory` (v0.3, portée PERSISTENT), même principe que la mémoire du
Director (§11).

### Interface

`/commercial` (`src/components/commercial-dashboard-client.tsx`) : statut
de l'agent, compteurs par étape du pipeline, formulaire de cycle complet
(`full_cycle` : création → qualification → score → potentiel → email →
recommandation en une seule demande), actions en attente d'approbation
(accepter/refuser), actions approuvées prêtes à l'envoi, pipeline,
historique. Accessible aux rôles Owner/Admin/Sales
(`src/components/nav-config.ts`), cohérent avec `/leads`/`/pipeline`.

### Délégation depuis le Director

Le Director délègue une étape à l'Agent Commercial exactement comme à
n'importe quel autre agent (`targetInstallationId` explicite ou
`targetCategory: "commercial"` résolu dynamiquement, §11) — aucune
logique spécifique au Commercial dans le Director. Testé de bout en bout
(`tests/agents/commercial-director-delegation.test.ts`) : le Director
délègue un `full_cycle`, et le travail a réellement eu lieu (prospect
créé/qualifié/scoré, email en attente d'approbation), pas seulement
rapporté par le plan.

### Tests

`tests/agents/commercial-scoring.test.ts`, `commercial-llm.test.ts`,
`commercial-prompts.test.ts` (moteurs, sans dépendance aux uns aux
autres), `tests/agents/commercial-agent.test.ts` (qualification, scoring,
génération, mémoire, permissions, reprise après erreur, journalisation,
mode autonome), `tests/agents/commercial-director-delegation.test.ts`, et
`tests/tenant-isolation/commercial.test.ts`.

## 13. Workflow Engine — moteur d'automatisation transversal (v0.6 — `ROADMAP.md` MOD-25)

Voir `docs/adr/0018` à `0022` pour la justification complète des choix
ci-dessous. Le Workflow Engine est un module d'infrastructure à part
entière (`src/lib/workflows/`), au même niveau que le Framework des
Agents (§10) et l'Agent Director (§11) — jamais une automatisation codée
en dur dans un module métier. Il ne réimplémente jamais l'exécution
d'agent : la seule intégration est l'action de plugin générique
`agent.call`.

### Graphe versionné, purement déclaratif

`WorkflowDefinition` (identité + cycle de vie DRAFT/ACTIVE/INACTIVE/
ARCHIVED, `activeVersionId` pilote seul les déclenchements) et
`WorkflowVersion` (graphe JSON immuable une fois créé) — même séparation
identité/version que `PromptTemplate` (§12). Un noeud (`WorkflowNode`,
`src/lib/workflows/graph-types.ts`) ne référence jamais de code
exécutable, seulement une clé (`triggerKey`/`actionKey`) résolue par un
registre en mémoire — même principe que `AgentDefinition.runtimeKey`
(ADR 0007, réappliqué ici — voir ADR 0018). Les templates
(`isTemplate: true`, `organizationId`/`workspaceId` nuls) sont des
`WorkflowDefinition` globaux, jamais activables directement : ils doivent
être clonés dans un workspace (`cloneWorkflowDefinition`), même
convention que les `AgentDefinition` globaux.

### Moteur d'expressions et de règles (`src/lib/workflows/expressions/`, `conditions/`)

Aucun `eval`/interpréteur de langage arbitraire (voir ADR 0020) : un
`Expr` ne peut être qu'une valeur littérale ou une référence de variable
(`{{ portée.chemin }}`, même convention `{{ }}` que le moteur de prompts,
§12) ; un `Rule` ne combine que des opérateurs fermés
(eq/neq/gt/gte/lt/lte/and/or/not/regex/exists/in/date_before/date_after/
permission) plus un point d'extension enregistré
(`conditions/registry.ts`, `op: "custom"`). L'action `variable.set`
substitue "Exécuter un script" du brief sans ouvrir de canal d'exécution
de code. Le contexte de variables (`VariableContext`) couvre exactement
les portées demandées : workflow/contexte/utilisateur/organisation/
workspace/agents/résultats/API/formulaires.

### Registres de déclencheurs et d'actions (système de plugins)

`triggers/registry.ts` : 14 types déclaratifs (évènements applicatifs,
planification — heure/cron réel à 5 champs, voir ADR 0021 — webhook,
action utilisateur, fin d'un autre workflow, exécution d'un agent).
`actions/registry.ts` : `WorkflowActionHandler` enregistré une fois,
même idiome que `tool-registry.ts` (v0.3). 6 actions réellement
implémentées (`agent.call`, `email.send` via l'abstraction email
existante, `http.call_api`, `notification.create`, `workflow.run_subworkflow`,
`variable.set`) et 7 actions honnêtement déclarées "non encore
implémentées" (`sms.send`, `file.write`, `document.generate`,
`customer.update`, `task.create`, `quote.create`, `invoice.create`,
`appointment.create` — même principe que `placeholder-tools.ts`, v0.3,
voir ADR 0022) plutôt que de dupliquer/contourner la logique déjà présente
dans les routes de Provence 360.

### Découplage par bus d'évènements (`src/lib/events/domain-events.ts`)

Pub/sub générique en mémoire, sans dépendance à aucun module métier ni au
Framework ni au Workflow Engine : `agents/execution-engine.ts` publie
`"agent_run.finished"` à la fin de chaque `AgentRun`, sans rien savoir du
Workflow Engine ; `workflows/trigger-engine.ts` s'y abonne indépendamment
pour le déclencheur "Exécution d'un agent" — voir ADR 0018. L'action
`agent.call` (couche supérieure) réutilise
`agents/installation-service.ts#resolveActiveInstallation` (factorisée,
aussi utilisée par le Director) et `agents/execution-engine.ts#runAgentToCompletion`
(extrait de `director/delegation-engine.ts`, comportement inchangé).

### Moteur d'exécution ré-entrant (`execution-engine.ts`)

Même principe de file interne sur PostgreSQL que `AgentRun` (ADR 0008,
réappliqué — voir ADR 0019) : `WorkflowRun.status=QUEUED` +
`scheduledAt` pour la file, `status=WAITING` + `resumeAt` pour les
noeuds d'attente. La progression réelle vit uniquement dans
`WorkflowRunStep` (jamais un état en mémoire) : `executeWorkflowRun` est
ré-entrante, rejoue seulement les noeuds non terminaux à chaque appel.
Séquentiel et parallèle : les noeuds "prêts" (dépendances terminales,
arête satisfaite) d'un même tick s'exécutent concurremment
(`Promise.allSettled`) ; jointure de type "OU" documentée comme limite
assumée (ADR 0019). Boucle (`type: "loop"`) : sous-graphe interne
(`bodyNodeIds`) exécuté séquentiellement par itération, non résumable
finement. Sous-workflow : délègue entièrement à l'action
`workflow.run_subworkflow` (un seul code, jamais deux implémentations),
pilotée de façon synchrone et bornée. Erreurs par noeud : `onError`
(stop/retry avec recul/ignore/alternative_branch via une arête
`branch: "error"`/notify/escalate_director — résout l'installation
Director active et lui crée un `AgentRun`). Compensation logique
(`compensateActionKey`) : rejoue, en ordre inverse, l'action de
compensation des étapes déjà réussies si une étape ultérieure échoue —
jamais un rollback SQL transactionnel (ADR 0019).

### Service de cycle de vie (`workflow-service.ts`)

Créer/modifier (nouvelle version, jamais en place)/activer (réindexe les
noeuds déclencheurs vers `WorkflowTriggerBinding` pour une résolution
rapide)/désactiver/cloner/exporter/importer/archiver. Validation
structurelle (`graph-validation.ts` : cycles hors boucle explicite,
arêtes orphelines, branches condition manquantes) appliquée avant tout
enregistrement — le même module, sans import "server-only", est
réutilisé côté client par l'éditeur pour la validation graphique
immédiate.

### 10 templates et tableau de bord

`templates/seed-templates.ts` : Prospection, Relance, Suivi client,
Création devis, Signature, Facturation, Support, Onboarding client, Suivi
visite virtuelle, Relance paiement — `WorkflowDefinition` globaux,
clonables. `dashboard-service.ts` : workflows actifs/inactifs/brouillon/
archivés, historique, taux de succès/échec, durée moyenne, files
d'attente, exécutions en cours, goulots d'étranglement (agrégation par
type de noeud/clé d'action, même convention que `agents/observability.ts`).

### API et éditeur visuel

`src/app/api/workflows/**` (CRUD, versions, activation/désactivation/
archivage, clonage, export/import, déclenchement manuel, dashboard,
registre pour la palette), `src/app/api/workflows/runs/**` (détail,
annulation, relance), `src/app/api/webhooks/workflows/[workspaceId]/
[workflowKey]` (déclencheur webhook générique), `POST /api/cron/
process-workflow-runs` (file d'attente + attentes + cron, même
convention que `process-agent-runs`).

`/workflows` (liste + tableau de bord + templates),
`/workflows/[id]` (éditeur : canevas SVG/HTML glisser-déposer,
zoom/déplacement, connexion par clic, inspecteur de noeud par type de
bloc, inspecteur d'arête pour les branches, inspecteur de variables,
versions, exécutions récentes — `src/components/workflow-editor-client.tsx`,
`workflow-graph-canvas.tsx`, sans dépendance à une librairie de graphes,
même parti pris que `director-plan-graph.tsx`, §11), `/workflows/runs/[runId]`
(chronologie des étapes, journal, annulation/relance). Accessible aux
rôles Owner/Admin/Sales, permission `MANAGE_WORKFLOWS` pour les mutations.

### Relation avec l'automatisation héritée de Provence 360

`AutomationRule`/`automation-engine.ts` (v0.1) restent en l'état, non
migrés — voir ADR 0022. C'est le chemin que toute automatisation future
doit emprunter, pas une réécriture rétroactive de l'existant.

### Tests

`tests/workflows/execution-engine.test.ts` (séquentiel, branchement,
parallèle, attente/reprise, retry, arrêt, boucle, timeout, branche
d'erreur, compensation), `tests/workflows/workflow-service.test.ts`
(cycle de vie complet, clonage/export/import, graphe invalide rejeté),
`tests/workflows/expressions.test.ts` (25 cas, tous les opérateurs),
`tests/workflows/actions.test.ts` (agent réel, HTTP simulé, email,
notification, variable, échecs explicites), `tests/workflows/triggers.test.ts`
(évènement, cron réel, bus d'évènements), `tests/workflows/permissions.test.ts`,
et `tests/tenant-isolation/workflows.test.ts`.

## 14. Intelligence documentaire — Memory/Knowledge/Context Engine, extension du Prompt Engine (v0.7 — `ROADMAP.md` MOD-26)

Voir `docs/adr/0023` à `0029` pour la justification complète des choix
ci-dessous. Quatre moteurs indépendants du fournisseur IA
(`src/lib/memory/`, `src/lib/knowledge/`, `src/lib/context/`, extension de
`src/lib/agents/prompts/`), au même niveau que le Framework des Agents
(§10) et le Workflow Engine (§13) : aucun agent ne doit gérer lui-même sa
mémoire ou son contexte, tout passe par cette couche.

### Memory Engine (`src/lib/memory/memory-engine.ts`)

Mémoire générique multi-niveaux : `MemoryScopeType`
(USER/ORGANIZATION/WORKSPACE/AGENT/WORKFLOW/CONVERSATION/TASK) croisé
avec `MemoryKind` (LONG_TERM/TEMPORARY/DECISION/DOCUMENT/PREFERENCE).
Chaque écriture (`setMemoryEntry`) crée une nouvelle version plutôt que
de modifier en place — même principe que `PromptTemplate` (§12) —,
l'historique complet reste consultable (`getMemoryHistory`). TTL par
défaut configurable par nature (`DEFAULT_TTL_MS_BY_KIND`), expiration
détectée par `clearExpiredMemoryEntries` (archivage doux) puis
`purgeArchivedMemoryEntries` (suppression définitive après rétention).
`compressMemoryEntry` réutilise le moteur LLM générique (§12, v0.5) pour
résumer une entrée volumineuse sans jamais modifier la valeur brute.
`AgentMemoryEntry` (v0.3, §10) reste un mécanisme distinct utilisé tel
quel par Director/Commercial — voir ADR 0023.

### Knowledge Engine (`src/lib/knowledge/`)

`KnowledgeDocument` (titre, contenu textuel complet, métadonnées, tags,
empreinte, statut de cycle de vie, compteur d'usage) et `KnowledgeChunk`
(fragment, embedding `Float[]`) — voir ADR 0024. Quatre sous-systèmes :

- **Parseurs** (`parsers/`) : registre `DocumentParser` par
  `KnowledgeSourceType` (19 types) — texte natif (Markdown/Note/
  Documentation/Email/HTML), sérialisation d'enregistrements Prisma
  existants (CRM/Devis/Conversation/Décision/Workflow/Log, strictement
  scopés organisation/workspace, jamais par `sourceRef` seul — voir ADR
  0026), stubs honnêtes pour les formats nécessitant une dépendance
  absente (PDF/Word/Excel/PowerPoint/Facture) et architecture préparée
  sans extraction pour Image/Audio/Vidéo (voir ADR 0027).
- **Embeddings** (`embeddings/`) : registre `EmbeddingProvider` (OpenAI,
  VoyageAI, Jina, Cohere, Nomic, Ollama, HuggingFace/BGE, démonstration
  déterministe par défaut), sélection par `EMBEDDING_PROVIDER` — même
  idiome que `LlmProvider` (§12, ADR 0015). `embedding-service.ts` ajoute
  cache en mémoire, coût estimé et journal (`EmbeddingRequest`).
- **Bases vectorielles** (`vector-stores/`) : registre `VectorStore`
  (PgVector par défaut — aucune extension `vector` disponible dans cet
  environnement, stockage `Float[]` + cosinus calculé côté application,
  voir ADR 0025 —, Pinecone/Qdrant/Weaviate/Chroma réellement
  implémentés, Milvus/FAISS/LanceDB honnêtement déclarés non
  implémentés), sélection par `VECTOR_STORE`.
- **Indexation** (`indexing-engine.ts`) : `ingestDocument` (ajout ou mise
  à jour, détection de changement par empreinte SHA-256 du contenu
  extrait — ignore la ré-vectorisation si inchangé), `deleteDocument`,
  `renameDocument`, `moveDocument`, `reindexDocument` (recalcule à partir
  du contenu déjà stocké, sans re-parser la source), `reindexAll` (lot,
  séquentiel), chaque opération journalisée (`KnowledgeIndexLog`,
  succès et échec).
- **Recherche** (`search/`) : `fulltextSearch` (filtrage SQL par présence
  d'un mot, classement par fréquence — pas de `tsvector`/GIN, voir ADR
  0025), `vectorSearch` (re-vérifie la portée après réponse de la base
  vectorielle active, jamais confiance aveugle en un index externe — ADR
  0026), `hybridSearch` (fusion de rangs réciproques), `findSimilarChunks`
  (plus proches voisins d'un fragment déjà indexé). `searchKnowledge`
  (point d'entrée unique, `mode: fulltext|vector|hybrid`) incrémente
  `KnowledgeDocument.usageCount` une seule fois par appel — jamais par
  moteur individuel — pour alimenter le tableau de bord.

### Context Engine (`src/lib/context/context-engine.ts`)

`assembleContext` : sélectionne automatiquement, par ordre de priorité
(contraintes métier fournies par l'appelant > préférences > mémoire
d'agent > documents utiles > décisions passées > résultats précédents >
historique de conversation), le contenu pertinent avant un appel IA, puis
compresse (troncage par priorité croissante, puis résumé via le moteur
LLM générique si le budget de tokens demandé reste dépassé). Journalise
systématiquement son résultat (nombre de sections par nature, compression,
estimation de tokens) via le logger structuré du projet.

### Prompt Engine (extension, pas de duplication — v0.5, §12)

`PromptTemplate` gagne `locale` (contrainte unique déplacée vers
`(key, version, locale)`, repli sur `"fr"`), `parentKey` (héritage borné,
cycles détectés) et `variableSchema` (typage/requis/description, fusionné
enfant-parent). `renderTemplateString` est extrait comme fonction pure,
testable sans base de données — voir ADR 0028.

### Intégration et observabilité

`generateNarrative` (Agent Commercial, §12) passe désormais
obligatoirement par `assembleContext` avant tout appel au fournisseur LLM
actif — seul point d'appel IA du Framework des Agents à ce jour ; le
Workflow Engine et le Scheduler en bénéficient de façon transitive (ils
invoquent des agents, jamais un LLM directement) — voir ADR 0029.
`getKnowledgeDashboard`/`getMemoryDashboard`
(`src/lib/knowledge/dashboard-service.ts`,
`src/lib/memory/dashboard-service.ts`) alimentent
`GET /api/knowledge/dashboard` et `/settings/knowledge` (documents par
statut/type de source, fragments, embeddings, indexation, cache, coût IA,
documents les plus utilisés, mémoire par niveau/nature ; "qualité des
réponses" honnêtement affichée comme indisponible faute de signal de
retour utilisateur).

### Tests

`tests/memory/memory-engine.test.ts`, `tests/memory/dashboard-service.test.ts`,
`tests/knowledge/embeddings.test.ts`, `tests/knowledge/vector-store.test.ts`,
`tests/knowledge/indexing-engine.test.ts`, `tests/knowledge/search.test.ts`,
`tests/knowledge/search-performance.test.ts`,
`tests/knowledge/dashboard-service.test.ts`,
`tests/context/context-engine.test.ts`,
`tests/agents/context-engine-integration.test.ts`, et
`tests/tenant-isolation/knowledge.test.ts`.

## 15. Automation Engine — moteur d'automatisation Enterprise (v0.8 — `ROADMAP.md` MOD-27)

Voir `docs/adr/0030` à `0037` pour la justification complète des choix
ci-dessous. Second moteur d'automatisation (`src/lib/automation/`),
entièrement nouveau et indépendant du Workflow Engine (§13, v0.6) : aucun
fichier de `src/lib/workflows/` n'est modifié pour l'intégrer — coexistence,
jamais remplacement (voir ADR 0030). Le différenciateur : chaque noeud
`action` d'un `AutomationRun` s'exécute comme un `AutomationJob` PERSISTÉ —
réclamé atomiquement, verrouillable, limité en concurrence, retryable,
dead-letterable — là où le Workflow Engine exécute chaque noeud en mémoire
dans le même appel.

### Graphe versionné (`graph-types.ts`/`graph-validation.ts`)

Même principe déclaratif que le Workflow Engine (§13) : `Automation`/
`AutomationVersion` séparent identité et version immuable. Dix types de
noeuds (`trigger`/`condition`/`switch`/`action`/`loop`/`map`/`wait`/`join`/
`subautomation`/`end`) — trois au-delà du Workflow Engine : `switch`
(branchement à N voies), `map` (itération PARALLÈLE — un `AutomationJob`
enfant par élément, par opposition à `loop`, séquentielle), `join` explicite
avec un mode `all`/`any` déclaré (referme le point laissé ouvert par l'ADR
0019 pour le Workflow Engine, sans jamais le modifier).

### Queue Manager, Lock Manager, Concurrency Manager (`queue/`, `lock/`, `concurrency/`)

`QueueProvider` découple la découverte du travail du stockage durable
(toujours `AutomationJob`) — fournisseur Postgres par défaut (`FOR UPDATE
SKIP LOCKED`, réclamation atomique en deux instructions simples, jamais une
CTE imbriquée — corrige un bug de concurrence réel découvert par test de
charge, voir ADR 0032), fournisseur mémoire réel, BullMQ/Redis/RabbitMQ/
SQS/Kafka honnêtement déclarés non implémentés (aucune infrastructure
correspondante dans ce projet). `LockManager` : verrou par bail (jamais un
verrou consultatif Postgres, incompatible avec le pool de connexions
Prisma). `Concurrency Manager` : limite globale de jobs `RUNNING`, limite
par `concurrencyKey`, rate limiter en mémoire par processus (limite
assumée en multi-instance).

### Retry Engine, Circuit Breaker, Dead Letter Queue (`retry/`, `dlq/`)

Sept stratégies de retry (exponentiel, linéaire, immédiat, manuel,
conditionnel — réutilise le Condition Engine —, infini borné en durée,
limité). Disjoncteur à 3 états (`CLOSED`/`OPEN`/`HALF_OPEN`) persisté
(`AutomationCircuitBreaker`), cohérent entre plusieurs instances de worker,
par périmètre `jobType:<clé>` (protège une dépendance externe partagée, pas
un tenant) — voir ADR 0033. La Dead Letter Queue n'est jamais une table
séparée : une vue sur `AutomationJob.status = 'DEAD_LETTERED'`, relance
strictement scopée organisation/workspace, jamais par id seul — voir ADR
0035.

### Enterprise Scheduler (`scheduler/`) et Priority Manager (`priority/`)

Module de planification AUTONOME, pas une extension du cron minimal du
Workflow Engine : évaluateur cron avec plages/listes/pas/alias
(`cron-engine.ts`), extraction de champs "heure murale" par fuseau IANA via
`Intl.DateTimeFormat` natif — aucune nouvelle dépendance (`timezone.ts`),
combinaison cron + jours ouvrés + jours fériés + blackout + fenêtres
d'exécution en une fonction sans état (`matchesSchedule`,
`schedule-engine.ts`) — voir ADR 0036. Le Priority Manager ne fait que
nommer des niveaux (`LOW`/`NORMAL`/`HIGH`/`CRITICAL`) au-dessus de l'entier
de priorité déjà trié par le Queue Manager.

### Condition Engine et Event Dispatcher (réutilisés, jamais dupliqués)

`src/lib/automation/conditions/index.ts` ré-exporte directement le moteur
d'expressions du Workflow Engine (`Rule`/`Expr`/`evaluateRule`, voir ADR
0020) — aucune réimplémentation. `triggers/event-dispatcher.ts` réutilise
le bus d'évènements générique (`domain-events.ts`, §13) sous les noms
`publishAutomationEvent`/`subscribeAutomationEvent` — voir ADR 0034.

### Trigger Engine (`trigger-engine.ts`) — 26 déclencheurs, câblage honnête et partiel

Catalogue complet des 26 types de déclencheurs demandés par le brief (cron,
date, heure, intervalle, webhook, API, event bus, workflow/agent terminé,
email reçu, lead créé/modifié/supprimé, client créé, paiement reçu,
document signé, utilisateur connecté/créé, organisation/workspace créé,
import/export terminé, erreur détectée, webhook externe, déclencheur
manuel/personnalisé). Seul un sous-ensemble défensable est réellement
câblé à un point d'émission de la plateforme (`lead.created`/`updated`/
`deleted`, `user.registered`/`logged_in`, `organization.created`/
`workspace.created`, `import.completed`, `schedule.cron`,
`webhook.received`, `manual.user_action`) — même honnêteté que le Workflow
Engine (§13, v0.6, qui ne câble réellement que `agent.run.completed`) — voir
ADR 0037. `fireAutomationsForEvent` filtre STRICTEMENT par organisation
quand le payload en fournit une. Étendu en v0.9 (§16, `MOD-28`) avec
`appointment.created`, `quote.sent`/`signed`/`signature_declined`,
`invoice.created`/`sent`/`paid`, `virtual_tour.created`/`shooting_done`/
`published`, `property.created` — déjà publiés par les services v0.9 mais
jusque-là sans abonné (extension anticipée par l'ADR 0037 elle-même).

### Job Executor (`executor/`) — le coeur du noyau de jobs

`advanceAutomationRun` fait progresser le graphe d'un `AutomationRun` d'UNE
génération et revient dès qu'il n'y a plus rien à faire immédiatement —
jamais de blocage (voir ADR 0031). Noeuds de contrôle de flux exécutés en
ligne (`trigger`/`condition`/`switch`/`join`/`end`/`wait`) ; noeuds `action`
matérialisés en `AutomationJob` puis sondés à chaque génération ; `loop`
(itération séquentielle) et `map` (itération parallèle, jusqu'à
`concurrencyLimit`) réutilisent un même moteur de tick générique
(`tick-graph.ts`) pour leur corps de noeuds ; `subautomation`/
`automation.call` créent un run enfant de façon ASYNCHRONE (contrairement
au `workflow.run_subworkflow` synchrone du Workflow Engine) — le run enfant
devenu terminal NOTIFIE explicitement son run parent, sans quoi rien ne le
ferait progresser. `processAutomationJobs` réclame un lot via le Queue
Manager actif, applique le Concurrency Manager, puis exécute chaque job
admis (verrou, disjoncteur, minuteur, Retry Engine, DLQ).

### Automation Registry (`registry/automation-service.ts`)

Même gabarit que `workflow-service.ts` (§13) : CRUD, versions, cycle de vie
(DRAFT/ACTIVE/INACTIVE/ARCHIVED), clonage, export/import JSON, indexation
des `AutomationTriggerBinding` à l'activation — séparation stricte d'avec
l'exécution (voir ADR 0031).

### Actions/jobs pluggables (`actions/`)

Douze gestionnaires réels (HTTP, email, notification, variable, agent,
workflow, automatisation imbriquée, indexation Knowledge Engine, écriture
Memory Engine, CRUD Lead) et huit stubs honnêtes (SMS, fichier, document,
client, tâche, devis, facture, rendez-vous) — même discipline que les
actions du Workflow Engine (§13) : dupliquées délibérément entre les deux
moteurs plutôt que partagées, pour garder des interfaces de contexte
découplées (voir ADR 0031).

### Tableau de bord, API et interface

`getAutomationDashboard` (automatisations par statut, runs, jobs par
statut/type avec durée moyenne/min/max, retries totaux, profondeur de
file, workers actifs — heuristique honnête, DLQ) alimente
`GET /api/automations/dashboard` et `/automations`. API REST typée
complète (`src/app/api/automations/**`, plus cron applicatif
`POST /api/cron/process-automations` et webhook entrant
`POST /api/webhooks/automations/[workspaceId]/[automationKey]`). Interface
(`/automations`, `/automations/[id]`, `/automations/runs/[runId]`,
`/automations/dlq`) avec édition de graphe en JSON (pas de canevas visuel
glisser-déposer pour cette phase), permission `MANAGE_AUTOMATIONS` dédiée
(même distribution de rôles que `MANAGE_WORKFLOWS`).

### Tests

`tests/automation/queue.test.ts` (dont un test de charge de concurrence),
`tests/automation/lock.test.ts`, `tests/automation/concurrency.test.ts`,
`tests/automation/retry.test.ts`, `tests/automation/dlq.test.ts`,
`tests/automation/priority.test.ts`, `tests/automation/scheduler.test.ts`,
`tests/automation/triggers.test.ts`,
`tests/automation/trigger-engine.test.ts`,
`tests/automation/automation-service.test.ts`,
`tests/automation/actions.test.ts`, `tests/automation/job-executor.test.ts`,
`tests/automation/dashboard-service.test.ts`,
`tests/automation/permissions.test.ts`, et
`tests/e2e/automation-golden-path.mjs`.

## 16. Provence 360 Operating System (v0.9 — `ROADMAP.md` MOD-28)

Voir `docs/adr/0038` et `0039` pour la justification complète. Contrairement
aux phases précédentes (un moteur transversal nouveau), v0.9 étend
ADDITIVEMENT le CRM/le suivi commercial/la production existants et
construit sept nouveaux agents métier + dix automatisations prêtes à
l'emploi au-dessus des moteurs déjà livrés (Framework des Agents, Workflow/
Automation Engine, Memory/Knowledge/Context Engine) — aucun moteur
transversal supplémentaire.

### CRM étendu (`Company`/`Property`/`Attachment`) et chronologie

`Lead` reste l'unique table CRM centrale. `Company` (regroupement
juridique optionnel), `Property` (bien immobilier, distinct du `Lead`
qui le représente) et `Attachment` (documents/photos polymorphes, même
convention qu'`AuditLog` — `entityType`/`entityId`, jamais une table par
type) sont additifs. `crm/timeline-service.ts` agrège en LECTURE SEULE
`LeadNote`/`Message`/`Conversation`/`Appointment`/`Task`/`Quote`/
`AuditLog`/`Attachment` par date — jamais une nouvelle table d'écriture.
`PipelineStage` (scopé organisation, seedé 1:1 avec les 14 valeurs de
`LeadStage`) personnalise l'AFFICHAGE du Kanban ; `Lead.stage` (l'enum)
reste l'unique source de vérité pour le scoring/l'automatisation/les
séquences.

### Devis étendus, Facturation (`quote-service.ts`, `invoice-service.ts`)

`Quote` gagne remise, taux/montant de TVA, PDF (`pdf-lib`, zéro
dépendance transitive, partagé entre devis et facture via
`commercial-document-pdf.ts`), versionnement immuable (`QuoteVersion`,
snapshot pris à l'envoi dans une transaction), abstraction de signature
électronique (fournisseur démo, comme demandé par le brief). `Invoice`/
`InvoiceLine` sont nouveaux — `convertQuoteToInvoice` exige
`Quote.status === ACCEPTED`, jamais une conversion automatique.

### Communication Hub (`src/lib/communication/`)

Registre par canal (SMS/WhatsApp/téléphone/webhook — email garde son
abstraction préexistante, plus riche), même idiome que les registres LLM/
embedding/Queue Manager (`resolveChannelProvider`/
`registerBuiltInCommunicationProviders`). Configuration PAR ORGANISATION
dans `Integration.config` (déjà en base depuis v0.2 mais jusque-là
décoratif). Webhook sortant RÉEL (signature HMAC-SHA256 optionnelle via
`metadata.secret`) ; SMS/WhatsApp/téléphone restent des stubs honnêtes
simulés (aucun fournisseur tiers disponible dans cet environnement).

### Emails réels par organisation (`src/lib/email/providers/`)

SMTP (`nodemailer`), Resend, Postmark, Brevo : implémentation RÉELLE et
complète (pas un stub simulé), qui échoue explicitement (`status:
"failed"`, message clair) si aucune configuration n'est présente —
jamais un faux succès. `resolveEmailConfig`/`configValue` lisent
`Integration.config` (kind EMAIL) avec repli sur variable
d'environnement pour le mode démo/mono-organisation. Vérifié contre de
VRAIS petits serveurs locaux (`smtp-server`, `http.createServer()`) plutôt
que des mocks — la vérification de bout en bout contre un vrai compte
Resend/Postmark/Brevo/SMTP externe n'a pas été possible dans cet
environnement (aucun identifiant disponible).

### Google Calendar réel (`src/lib/calendar/google/`)

OAuth2 + REST via `fetch()` direct (cohérent avec le reste de la
plateforme — aucun SDK lourd comme `googleapis`). `trySyncAppointmentToGoogle`
est TOUJOURS best-effort (ne bloque jamais la création/modification d'un
rendez-vous en cas d'échec de synchronisation, seulement un avertissement
journalisé). `getGoogleCalendarBusySlots` calcule les disponibilités
réelles ; en l'absence de connexion, l'appelant retombe honnêtement sur
les vrais `Appointment` déjà enregistrés. Vérifié contre un vrai serveur
HTTP local simulant l'API Google (OAuth token exchange/refresh, Calendar
API create/update/delete/freeBusy).

### Visites 3D (`VirtualTour`, `src/lib/production/virtual-tour-service.ts`)

Nouveau module métier dédié Provence 360 (lien Matterport, lien de
visite, surface, type, statut). `leadId` est TOUJOURS dérivé de la
`Mission` liée (via `Mission.customer.leadId`), jamais accepté séparément
en entrée — élimine tout risque d'incohérence entre le client d'une
visite et celui de sa mission. `Mission` (`MOD-08`) reste intentionnellement
générique, non modifié.

### Tableaux de bord métier (`src/lib/dashboards/dashboard-service.ts`)

Six tableaux de bord non encore couverts par les phases précédentes
(Production, Clients, Visites, Rendez-vous, Activité IA, Performance),
sur une seule page `/dashboards` — Commercial/CA (`/dashboard`, existant)
et Automatisations (`/automations`, v0.8) le sont déjà.

### Sept agents métier — sur les VRAIES données CRM, jamais un modèle de démonstration

Prospection, Relance, Devis, Planning, Réseaux sociaux, Support, Analyse
suivent le même PATRON architectural que l'Agent Commercial (v0.5) —
`AgentDefinition` + runtime + outils déclaratifs + câblage Context Engine
obligatoire (ADR 0029) + journal d'audit + vérification de permission —
mais opèrent sur les vraies tables `Lead`/`Quote`/`Appointment`/
`VirtualTour`/`Conversation` et réutilisent les vrais services déjà
construits en v0.9 (`quote-service.ts`, `calendar/google/*`, `stats.ts`,
le vrai moteur de scoring `@/lib/scoring`) — JAMAIS un modèle de
démonstration séparé comme `CommercialProspect`/`CommercialAction`
(propre à Commercial, non modifié). Voir ADR 0039 pour la justification
complète de ce choix. Deux extractions évitent de dupliquer sept fois la
même plomberie : `agents/shared/generation.ts#generateAgentNarrative`
(appel LLM + Context Engine, extrait de `commercial/generation.ts` sans
changer sa signature externe) et
`agents/shared/simple-runtime.ts#createSimpleAgentRuntime` (runtime de
dispatch générique action → outil déclaratif). Support et Analyse
PROMEUVENT les stubs DRAFT créés en v0.4 (`future-support-agent`/
`future-analyse-agent`, même mécanisme `promoteGlobalAgentDefinition` que
Commercial en v0.5) ; les cinq autres sont créés directement PUBLISHED.
Aucun envoi/publication automatique (ADR 0017, inchangée) : les messages
générés restent `PENDING_VALIDATION`, la publication sociale et la
réservation de rendez-vous sont les seules actions à effet immédiat
(cohérent avec leur nature — un rendez-vous réservé n'a pas besoin d'une
validation humaine intermédiaire, contrairement à un message envoyé à un
prospect).

### Dix automatisations métier prêtes à l'emploi (Automation Engine)

Mêmes principes que les 10 templates du Workflow Engine (v0.6,
`workflows/templates/seed-templates.ts`) appliqués à l'Automation Engine
(v0.8, `automation/templates/seed-templates.ts`) : `Automation` globaux
(`isTemplate: true`, `workspaceId` nul), jamais activables directement,
clonés dans un workspace avant activation. Différence assumée : CHAQUE
déclencheur et CHAQUE action référencés sont réellement câblés dès
aujourd'hui (contrairement à certains templates v0.6 qui référençaient
une action pas encore implémentée à l'époque) — nécessite d'étendre
`REAL_EMISSION_EVENT_KEYS` (§15, ADR 0037) avec les évènements
`quote.*`/`invoice.*`/`virtual_tour.*`/`property.created` déjà publiés
par les services v0.9 mais jusque-là sans abonné, et un nouveau point
d'émission réel `appointment.created`.

### Réglages (`/settings`)

Coordonnées légales/TVA/logo de l'organisation (`Organization.logoUrl`/
`vatNumber`/`siret`/`legalAddress`/`phone`/`invoicePrefix`/`quotePrefix`,
déjà en base depuis les extensions CRM ci-dessus mais rendues éditables
ici — alimentent les PDF de devis/factures). Identifiants email par
organisation (`updateEmailIntegrationConfig`, fusionne plutôt que
remplace — un secret laissé vide dans le formulaire ne remplace jamais un
secret déjà enregistré ; `getEmailConfigPreview` ne renvoie JAMAIS un
secret en clair au navigateur, seulement sa présence). Le fournisseur IA
reste un réglage de DÉPLOIEMENT (`LLM_PROVIDER`/`AI_PROVIDER`, ADR 0015),
jamais par organisation — la section correspondante affiche un statut
honnête plutôt qu'un formulaire qui n'agirait sur rien (voir ADR 0039).

### Tests

`tests/crm/{timeline,pipeline}-service.test.ts`,
`tests/crm/{quote,invoice}-service.test.ts`,
`tests/communication/hub-service.test.ts` (vrai serveur HTTP local),
`tests/email/real-providers.test.ts` (vrais serveurs SMTP/HTTP locaux),
`tests/email/email-settings.test.ts`,
`tests/calendar/google-calendar.test.ts` (vrai serveur HTTP local),
`tests/production/virtual-tour-service.test.ts`,
`tests/dashboards/dashboard-service.test.ts`,
`tests/agents/{prospection,relance,devis,planning,social,support,
analyse}-agent.test.ts` (effets de bord réels vérifiés dans chaque
table concernée), `tests/automation/business-automation-templates.test.ts`
(scénario complet déclencheur→job→agent→effet réel), et
`tests/settings/organization-settings.test.ts`.
