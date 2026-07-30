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
