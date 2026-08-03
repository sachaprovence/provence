# Autorun — Guide de développement

> Guide pratique de travail au quotidien sur ce dépôt. Complète
> `docs/00-AUTORUN-VISION.md` (vision), `ROADMAP.md` (modules),
> `BACKLOG.md` (tâches) et `MILESTONES.md` (jalons) — ce document répond à
> "comment on travaille", pas "quoi construire".

## 0. État du socle technique (v0.1)

Les tâches `AR-0001` à `AR-0006` (`BACKLOG.md`, v0.1) sont livrées, avec un
périmètre volontairement élargi par rapport au plan initial (validation
d'environnement, logger, gestion d'erreurs, kit UI de base, contrôle de
santé — voir `docs/02-ARCHITECTURE.md` §8 pour le détail complet et
`docs/adr/` pour les décisions structurantes prises). Concrètement,
disponibles dès aujourd'hui pour tout nouveau code :

- `src/lib/env.ts` (config validée) et `src/instrumentation.ts` (fail fast
  au boot).
- `src/lib/logger.ts` (logger structuré) et `src/lib/errors.ts`
  (`AppError` + `toApiErrorResponse`).
- `src/components/ui/*` (`Button`, `Input`, `Textarea`, `Select`, `Card`,
  `Badge`, `Spinner`, `Skeleton`, `EmptyState`, `ToastProvider`/`useToast`).
- Pages spéciales Next.js : `error.tsx`, `global-error.tsx`,
  `not-found.tsx`, `(app)/error.tsx`, `(app)/loading.tsx`.
- `GET /api/health`, CI (`.github/workflows/ci.yml`,
  `.github/workflows/e2e.yml`), `tests/helpers/tenant-isolation.ts`.

Le code métier existant (CRM, devis, IA, séquences) n'a pas été modifié en
profondeur : seules les pages d'authentification ont été mises à jour pour
utiliser le nouveau kit UI, à titre de démonstration réelle de son
fonctionnement (voir ADR 0004 sur la portée volontairement limitée du
reformatage Prettier rétroactif).

## 0 bis. État du multi-tenant (v0.2)

Le modèle multi-tenant Organization/Workspace (`ROADMAP.md` MOD-21) est
livré, en remplacement du plan initial de v0.2 (voir `MILESTONES.md`).
Points à connaître pour tout nouveau code :

- `Organization` reste la frontière multi-tenant historique, inchangée.
  `Workspace` (`src/lib/workspace-service.ts`,
  `src/lib/workspace-context.ts`) est un sous-espace additif au sein d'une
  organisation — voir ADR 0005/0006 avant de toucher à ce périmètre.
- **Toute nouvelle route qui gère une ressource de workspace** doit
  utiliser `requireWorkspaceActorApi()`/`requireWorkspaceActor()` (pas
  seulement `requireActorApi()`) et passer l'identifiant reçu du client
  par `resolveWorkspaceOrThrow()` avant tout accès — jamais de confiance
  directe dans un `workspaceId`/`organizationId` de requête.
- Toute action sensible de workspace doit passer par
  `requireWorkspacePermission()`, qui journalise systématiquement un
  refus (`access.denied`) — ne jamais vérifier `actor.workspace.role`
  à la main dans une route.
- Deux systèmes de rôles cohabitent (`MembershipRole` historique 3
  valeurs, `WorkspaceRole` nouveau 8 valeurs) — ne pas les fusionner sans
  un nouvel ADR ; toute route existante continue d'utiliser
  `MembershipRole`/`src/lib/permissions.ts` sans changement.
- Tout chemin qui crée une organisation (inscription, seed, futur
  onboarding self-service) **doit** créer son workspace par défaut dans la
  même transaction — un oubli sur `prisma/seed.ts` a été détecté et corrigé
  pendant la vérification finale de v0.2 ; `tests/workspace-migration.test.ts`
  couvre désormais cet invariant.

## 0 ter. État du Framework des Agents IA (v0.3)

Le Framework des Agents (`ROADMAP.md` MOD-22, `docs/02-ARCHITECTURE.md`
§10) est livré, en remplacement du plan initial de v0.3 (voir
`MILESTONES.md`). **Aucun agent métier n'existe encore** — ce socle est le
passage obligé de tout futur agent (Commercial, CRM, Marketing,
Comptabilité, Support, Analyse, Directeur, ou autre). Points à connaître
pour tout nouveau code touchant ce périmètre :

- **Un agent métier ne se code jamais « à part »** : il s'implémente comme
  un `AgentRuntime` (`src/lib/agents/types.ts`), enregistré via
  `registerAgentRuntime` dans `src/instrumentation.ts`, référencé par le
  `runtimeKey` d'une `AgentDefinition`. Ne jamais créer de route ou de
  service ad hoc pour un nouvel agent — voir ADR 0007/0008/0009 avant de
  toucher à ce périmètre.
- **Toute installation d'agent reste plafonnée** :
  `assertGrantsWithinDeclaredCeiling` (`src/lib/agents/permissions.ts`)
  refuse tout droit (outil ou permission) dépassant à la fois ce que la
  `AgentDefinition` déclare et ce que le rôle de workspace de l'acteur
  humain autorise lui-même — jamais de contournement, même pour un agent
  jugé « de confiance ».
- **Tout appel d'outil par un agent** doit passer par
  `requireAgentToolPermission` (jamais un appel direct au
  `ToolHandler` depuis un runtime) — le refus est systématiquement
  audit-logué (`agent.tool_access_denied`).
- **Un nouvel outil** s'ajoute uniquement via `src/lib/agents/tools/*.ts`
  + `registerToolHandler`, puis déclaré dans `AGENT_TOOL_CATALOG`
  (`src/lib/agents/bootstrap.ts`) — jamais une logique d'outil inline dans
  un runtime d'agent.
- **Écriture mémoire** : toujours via `setMemory`
  (`src/lib/agents/memory.ts`), jamais un `prisma.agentMemoryEntry.upsert`
  direct — la contrainte d'unicité ne fonctionne pas correctement avec un
  `installationId` nullable (voir ADR 0009).
- **Tests d'agent** : le nettoyage de fixtures
  (`tests/helpers/agent-fixtures.ts`, `cleanupAgentTestFixtures`) doit
  toujours cibler des identifiants exacts (organisation, utilisateur,
  définition) collectés par le test lui-même — jamais un filtre large
  type `startsWith`, et toujours supprimer les organisations avant les
  `AgentDefinition` (contrainte `ON DELETE RESTRICT` sur
  `AgentInstallation.definitionId`). **Chaque fichier de test doit tracer
  ses propres définitions** (le paramètre `definitionIds` de
  `cleanupAgentTestFixtures` n'est pas optionnel en pratique) — un oubli
  a pollué le catalogue réel en base pendant la v0.4 (voir §0 quater),
  détecté et corrigé.
- **Le registre en mémoire ne dépend plus uniquement du démarrage** :
  `src/instrumentation.ts` appelle `registerBuiltInAgentComponents()` une
  fois au boot, mais `execution-engine.ts#executeAgentRun` le rappelle
  aussi, défensivement, à chaque exécution (idempotent, coût négligeable)
  — voir ADR 0013. Ne jamais supposer qu'un enregistrement fait ailleurs
  suffit : tout nouveau point d'entrée qui résout un runtime/outil doit
  soit passer par `executeAgentRun`, soit appeler
  `registerBuiltInAgentComponents()` lui-même en tout début de fonction.

## 0 quater. État de l'Agent Director (v0.4)

Le premier agent réel d'Autorun (`ROADMAP.md` MOD-23,
`docs/02-ARCHITECTURE.md` §11) est livré, en remplacement du plan initial
de v0.4 (voir `MILESTONES.md`). **C'est un orchestrateur, pas un agent
métier** : il ne réalise jamais lui-même de tâche CRM/commerciale/
financière, il délègue. Points à connaître pour tout nouveau code touchant
ce périmètre :

- **Le Director est un agent comme les autres** : `AgentDefinition` +
  `AgentInstallation`, exécuté par `executeAgentRun` (aucun raccourci).
  Ne jamais faire exécuter sa logique en dehors du moteur d'exécution du
  Framework.
- **Toute délégation passe par les 4 outils `director.*`**
  (`src/lib/agents/tools/director-tools.ts`), jamais par un appel direct
  à `delegation-engine.ts` depuis un runtime — c'est ce qui garantit la
  vérification de permission systématique (`requireAgentToolPermission`).
  Un nouvel agent orchestrateur futur doit suivre le même principe.
- **Une étape de plan n'appartient qu'à son propre orchestrateur** :
  `loadOwnedStep` (`director-tools.ts`) vérifie que le plan appartient à
  l'installation appelante avant toute action — reproduire cette
  vérification pour tout nouveau point d'accès à `AgentPlanStep`.
- **La délégation est synchrone et intra-processus** (ADR 0010) : un
  agent délégué est entièrement exécuté (jusqu'à un statut terminal)
  avant que `delegateStep` ne rende la main — ne pas supposer un
  comportement asynchrone/en file pour un sous-agent délégué par le
  Director.
- **La décomposition automatique de l'objectif est une heuristique**
  (ADR 0011), pas une IA réelle — pour un besoin de décomposition fiable,
  toujours préférer fournir `steps` explicitement
  (`directorRequestSchema`, `src/lib/validations/director.ts`) plutôt que
  de compter sur l'heuristique.
- **Un futur agent métier** (CRM, Marketing, Support, Analyse, Finance,
  Développement — le Commercial est passé de "futur" à réel en v0.5, voir
  §0 quinquies) doit d'abord avoir son contrat dans
  `src/lib/agents/director/capability-contracts.ts` avant toute
  implémentation — voir ADR 0012. Passer son `AgentDefinition` de `DRAFT`
  à `PUBLISHED` (`promoteGlobalAgentDefinition`, `bootstrap.ts`) est la
  seule étape qui le rend installable.
- **Toute nouvelle fonctionnalité du Framework des Agents doit être
  vérifiée au moins une fois par une vraie requête HTTP contre un build de
  production** (`next build && next start`), pas seulement par la suite
  `vitest` — c'est ce test précis qui a révélé le défaut corrigé en
  ADR 0013, invisible dans un process `vitest` unique.

## 0 quinquies. État de l'Agent Commercial (v0.5)

Le premier agent **métier** d'Autorun (`ROADMAP.md` MOD-24,
`docs/02-ARCHITECTURE.md` §12) est livré, en remplacement du plan initial
de v0.5 (voir `MILESTONES.md`). Points à connaître pour tout nouveau code
touchant ce périmètre :

- **Ne jamais réutiliser `Lead`/`LeadCategory`** pour un besoin
  générique multi-vertical : ce sont des modèles spécifiques au vertical
  photographie 360° de Provence 360. Le Commercial a son propre modèle
  (`CommercialProspect`/`CommercialAction`) — voir ADR 0014. Un futur
  agent métier doit suivre le même principe, pas réutiliser les tables de
  Provence 360.
- **Toute action proposée par un agent métier doit naître
  `PENDING_APPROVAL`** (voir `createAction`, `commercial-service.ts`) —
  jamais `SENT` directement, même en mode autonome
  (`AgentInstallation.config.autonomousMode`). Un futur agent métier qui
  produit des actions (email, document, paiement...) doit reproduire ce
  même principe : approbation par défaut, autonomie une option explicite,
  envoi toujours une étape distincte de l'approbation — voir ADR 0017.
- **Un nouveau fournisseur LLM** s'ajoute dans
  `src/lib/agents/llm/providers/*.ts` (implémente `LlmProvider`, lève une
  erreur explicite si non configuré, seulement au moment de l'appel) puis
  s'enregistre dans `src/lib/agents/llm/index.ts` — jamais un fournisseur
  choisi en dur dans un outil ou un runtime d'agent (toujours via
  `getActiveLlmProvider()`, piloté par `LLM_PROVIDER`).
- **Un nouveau prompt** se crée via `createPromptVersion`
  (`src/lib/agents/prompts/prompt-engine.ts`), jamais comme une chaîne
  TypeScript inline dans un outil — voir ADR 0016.
- **Un nouveau facteur de scoring** s'ajoute via `registerScoringFactor`
  (`src/lib/agents/commercial/scoring-engine.ts`), jamais en modifiant
  `computeScore`.
- Le champ générique `AgentInstallation.config` (v0.3) porte maintenant un
  premier usage concret réel : `{ autonomousMode: boolean }` pour le
  Commercial. Un futur agent peut y ajouter ses propres clés de
  configuration sans migration de schéma.

## 0 sexies. État du Workflow Engine (v0.6)

Le moteur d'automatisation transversal d'Autorun (`ROADMAP.md` MOD-25,
`docs/02-ARCHITECTURE.md` §13) est livré, en remplacement du plan initial
de v0.6 (voir `MILESTONES.md`). Points à connaître pour tout nouveau code
touchant ce périmètre :

- **Ajouter un nouveau déclencheur ou une nouvelle action = enregistrer
  une entrée de registre**, jamais modifier `execution-engine.ts`. Un
  déclencheur : `registerTriggerType` (`triggers/registry.ts`, métadonnée
  pure, n'importe quelle `eventKey` fonctionne même non enregistrée). Une
  action : implémenter `WorkflowActionHandler` et l'enregistrer via
  `registerWorkflowAction` (`actions/registry.ts`) — voir
  `actions/builtin/*.ts` comme modèles, en particulier le principe
  honnête des stubs "non encore implémenté" (`not-yet-implemented-actions.ts`,
  ADR 0022) plutôt qu'un faux succès ou une logique métier dupliquée.
- **Ne jamais coupler fortement le Workflow Engine à un agent métier
  spécifique** : la seule façon dont un workflow parle à un agent est
  l'action générique `agent.call` (par `installationId` ou `category`),
  jamais un import direct d'un service d'agent (`commercial-service.ts`
  etc.) — voir ADR 0018. Le déclencheur "Exécution d'un agent" passe par
  le bus d'évènements générique (`src/lib/events/domain-events.ts`),
  jamais par un import direct entre `agents/execution-engine.ts` et le
  Workflow Engine.
- **Aucune exécution de code arbitraire** : "Exécuter un script" est
  couvert par le moteur d'expressions sûr (`expressions/evaluator.ts`) et
  l'action `variable.set`, jamais par `eval`/`new Function` — voir
  ADR 0020. Un besoin de calcul plus riche se couvre en écrivant une
  nouvelle action de plugin TypeScript déployée, jamais en élargissant le
  langage d'expression accepté depuis l'éditeur.
- **La progression d'un run vit uniquement dans `WorkflowRunStep`**,
  jamais dans un état en mémoire du moteur — `executeWorkflowRun` doit
  toujours rester ré-entrante (rechargée depuis la base à chaque appel).
  Toute nouvelle sémantique d'exécution doit préserver cette propriété
  pour que la reprise après interruption continue de fonctionner — voir
  ADR 0019 pour les limites déjà assumées (jointure "OU", boucle
  non-résumable finement, sous-workflow suspendu non pris en charge).
- **Un nouvel opérateur de condition** s'ajoute via
  `registerConditionOperator` (`conditions/registry.ts`, `Rule` avec
  `op: "custom"`), jamais en modifiant les opérateurs fermés de
  `evaluator.ts`.
- **`AutomationRule`/`automation-engine.ts` (Provence 360, v0.1) ne sont
  pas touchés** et ne doivent pas l'être sans décision explicite — voir
  ADR 0022. Toute nouvelle automatisation doit passer par le Workflow
  Engine, jamais par une extension de ce mécanisme hérité.
- **Toute nouvelle fonctionnalité du Workflow Engine doit être vérifiée
  au moins une fois par une vraie requête HTTP contre un serveur en cours
  d'exécution** (pas seulement `vitest`) — même discipline que le
  Framework des Agents (§0 quater/quinquies) : c'est ce test qui a
  révélé, en v0.6, un bug d'auto-référence sur le noeud "fin" (jamais
  renvoyer `ctx.results` directement une fois affecté à
  `ctx.results[nodeId]`) et une erreur de résolution de l'expression de
  collection d'une boucle, invisibles dans les tests unitaires seuls tant
  que le graphe testé restait trivial.

## 0 septies. État de l'intelligence documentaire (v0.7)

Les quatre moteurs Memory/Knowledge/Context/Prompt Engine (`ROADMAP.md`
MOD-26, `docs/02-ARCHITECTURE.md` §14) sont livrés, en remplacement du
plan initial de v0.7 (voir `MILESTONES.md`). Points à connaître pour tout
nouveau code touchant ce périmètre :

- **Tout nouvel appel à un fournisseur IA générative doit passer par
  `assembleContext` (`src/lib/context/context-engine.ts`) avant l'appel
  au fournisseur LLM actif** — jamais un agent qui gère lui-même sa
  mémoire ou son contexte. Aujourd'hui, `generateNarrative`
  (`agents/commercial/generation.ts`) est le seul point d'appel réel et
  il est déjà câblé ; un futur agent générant du texte doit être câblé de
  la même façon dès sa création, pas après coup — voir ADR 0029.
- **Ajouter une nouvelle source de connaissance = enregistrer un
  `DocumentParser`**, jamais modifier `indexing-engine.ts`
  (`parsers/registry.ts`, un par `KnowledgeSourceType`) — voir
  `parsers/record-parsers.ts`/`text-parsers.ts` comme modèles, en
  particulier le principe honnête des stubs "non encore implémenté"
  (`not-yet-implemented-parsers.ts`, ADR 0027) plutôt qu'un faux contenu
  extrait. Même principe pour un nouveau fournisseur d'embedding
  (`embeddings/registry.ts`) ou une nouvelle base vectorielle
  (`vector-stores/registry.ts`).
- **Un parseur de source déjà en base (CRM/Devis/Conversation/Décision/
  Workflow/Log) doit toujours scoper sa lecture par
  `ctx.organizationId`/`ctx.workspaceId`, jamais faire confiance à
  `sourceRef` seul** — voir ADR 0026. Même discipline pour toute nouvelle
  requête de recherche : re-vérifier la portée même après une réponse
  d'un index externe déjà filtré (voir `search/vector-search.ts`).
- **`MemoryEntry` (générique, tous niveaux) et `AgentMemoryEntry` (v0.3,
  Director/Commercial) sont deux mécanismes distincts qui coexistent
  volontairement** — voir ADR 0023. Tout nouveau code doit utiliser
  `MemoryEntry`/`memory-engine.ts` ; ne jamais faire évoluer
  `AgentMemoryEntry` en pensant "améliorer la mémoire" sans vérifier
  d'abord lequel des deux systèmes est concerné.
- **Le Prompt Engine reste unique** (`agents/prompts/prompt-engine.ts`,
  étendu en v0.7 avec locale/héritage/schéma typé, jamais dupliqué) —
  voir ADR 0028. Un nouveau prompt s'ajoute via `createPromptVersion`,
  jamais codé en dur dans un service.
- **Aucune extension `pgvector` n'est disponible dans cet environnement**
  : la base vectorielle par défaut (`pgvector-store.ts`) reste
  fonctionnellement équivalente (Postgres natif + cosinus applicatif) mais
  balaie l'ensemble des candidats filtrés — ne pas supposer un index
  approximatif sans vérifier d'abord `VECTOR_STORE` — voir ADR 0025.
- **Toute nouvelle fonctionnalité de ce périmètre doit être vérifiée au
  moins une fois par une vraie requête HTTP contre un serveur en cours
  d'exécution** (pas seulement `vitest`) — même discipline que les phases
  précédentes : `/settings/knowledge` a été vérifié visuellement (capture
  d'écran, zéro erreur console) derrière une session admin réelle avant
  livraison.

## 0 octies. État de l'Automation Engine (v0.8)

Le moteur d'automatisation Enterprise (`ROADMAP.md` MOD-27,
`docs/02-ARCHITECTURE.md` §15) est livré, en remplacement du plan initial
de v0.8 (infrastructure de jobs minimale, `MOD-15` — voir `MILESTONES.md`
§v0.8 bis). Points à connaître pour tout nouveau code touchant ce
périmètre :

- **`src/lib/automation/` coexiste avec `src/lib/workflows/` (v0.6), jamais
  une modification de ce dernier** — voir ADR 0030. Un nouveau besoin
  d'automatisation synchrone légère (pas de garanties de reprise/verrou/
  concurrence par étape) reste du ressort du Workflow Engine ; un besoin de
  job durable (retry, verrou, concurrence, priorité, dead-letter) passe par
  l'Automation Engine.
- **Aucun point d'entrée de l'Automation Engine n'attend un run jusqu'au
  bout** (voir ADR 0031) : `advanceAutomationRun` revient dès qu'il n'y a
  plus rien à faire immédiatement, jamais de blocage sur un job/sous-run en
  vol. Un nouveau code appelant doit interroger le run (`GET
  /api/automations/runs/[runId]`) plutôt que supposer un résultat
  disponible immédiatement après déclenchement.
- **Ajouter un nouveau job/action = enregistrer un `AutomationJobHandler`**
  (`src/lib/automation/actions/registry.ts`), jamais modifier le Job
  Executor — voir `actions/builtin/*.ts` comme modèles, en particulier le
  principe honnête des stubs "non encore implémentée"
  (`not-yet-implemented-actions.ts`) plutôt qu'un faux succès. Même
  principe pour un nouveau type de déclencheur (`triggers/registry.ts`) —
  mais un déclencheur DÉCLARÉ n'est pas forcément CÂBLÉ à un point
  d'émission réel : voir `trigger-engine.ts#REAL_EMISSION_EVENT_KEYS` (ADR
  0037) avant de supposer qu'un évènement applicatif déclenche déjà une
  automatisation.
- **Le Queue Manager Postgres réclame par `SELECT ... FOR UPDATE SKIP
  LOCKED` en deux instructions simples, jamais une CTE imbriquée** — un
  bug de concurrence réel (dépassement de `LIMIT` sous forte charge) a été
  corrigé ainsi et gardé sous test de charge dédié
  (`tests/automation/queue.test.ts`) — voir ADR 0032. Ne jamais réintroduire
  une CTE imbriquée dans `claim()` sans revalider sous charge concurrente.
- **Une clé de disjoncteur (`jobType:<clé>`) est un état GLOBAL persisté,
  partagé entre plusieurs suites de test parallèles** — tout nouveau test
  qui a besoin d'un job systématiquement en échec doit utiliser un type de
  job DÉDIÉ (jamais réutiliser `jobType:sms.send` d'un autre fichier de
  test) ou réinitialiser explicitement le disjoncteur
  (`recordCircuitSuccess`) à son démarrage — voir ADR 0033 et les
  commentaires de `tests/automation/job-executor.test.ts`/
  `dashboard-service.test.ts`.
- **La Dead Letter Queue n'est jamais une table séparée** (vue sur
  `AutomationJob.status = 'DEAD_LETTERED'`) et `replayDeadLetter` exige
  toujours `{organizationId, workspaceId}`, jamais un id seul — voir ADR
  0035.
- **Le Condition Engine et l'Event Dispatcher sont réutilisés depuis le
  Workflow Engine/`domain-events.ts`, jamais dupliqués** — voir ADR 0034.
  Toute évolution du moteur d'expressions doit se faire dans
  `workflows/expressions/`, jamais dans une copie locale à
  `automation/conditions/`.
- **Un run enfant (`subautomation`/`automation.call`) devenu terminal doit
  notifier explicitement son run parent** (`notifyParentRun` dans
  `job-executor.ts`) — sans quoi rien d'autre ne ferait progresser le
  parent (il n'est ni `QUEUED` ni propriétaire du job qui vient de se
  terminer). Toute nouvelle relation parent/enfant introduite dans le Job
  Executor doit respecter ce même principe de notification explicite.
- **Toute nouvelle fonctionnalité de ce périmètre doit être vérifiée au
  moins une fois par une vraie requête HTTP contre un serveur en cours
  d'exécution** — `/automations`, `/automations/[id]`,
  `/automations/runs/[runId]` et `/automations/dlq` ont été vérifiés de
  bout en bout (création, activation, déclenchement, avancée via le cron
  applicatif, run `SUCCEEDED` visible) via
  `tests/e2e/automation-golden-path.mjs` contre un serveur réellement
  démarré, zéro erreur console.

## 0 novies. État du Provence 360 Operating System (v0.9)

Le système d'exploitation métier de Provence 360 (`ROADMAP.md` MOD-28,
`docs/02-ARCHITECTURE.md` §16) est livré, en remplacement du plan initial
de v0.9 (observabilité transversale + connecteurs réels IA/email, voir
`MILESTONES.md` §v0.9 bis). Points à connaître pour tout nouveau code
touchant ce périmètre :

- **Les 7 agents métier (Prospection/Relance/Devis/Planning/Réseaux
  sociaux/Support/Analyse) opèrent sur les VRAIES tables CRM, jamais un
  modèle de démonstration** — contrairement à l'Agent Commercial (v0.5),
  qui reste sur `CommercialProspect`/`CommercialAction` (non modifié).
  Tout nouvel outil pour l'un de ces agents doit lire/écrire les vraies
  tables (`Lead`/`Quote`/`Appointment`/`VirtualTour`/`Conversation`) et
  réutiliser les vrais services déjà construits (`quote-service.ts`,
  `calendar/google/*`, `stats.ts`, `@/lib/scoring`) — voir ADR 0039.
  N'écrivez jamais un nouvel outil d'agent métier contre
  `commercial/scoring-engine.ts` ou un modèle de démonstration similaire.
- **`agents/shared/generation.ts#generateAgentNarrative` et
  `agents/shared/simple-runtime.ts#createSimpleAgentRuntime` sont les
  points d'extension communs des 8 agents métier** (Commercial + les 7
  nouveaux) — un nouvel agent métier simple (une action = un appel
  d'outil) doit utiliser `createSimpleAgentRuntime`, jamais réécrire un
  runtime de dispatch depuis zéro.
- **Étendre le câblage réel de l'Automation Engine reste une liste
  explicite** (`trigger-engine.ts#REAL_EMISSION_EVENT_KEYS`, ADR 0037) —
  v0.9 y a ajouté `appointment.created`, `quote.*`, `invoice.*`,
  `virtual_tour.*`, `property.created`. Un nouveau `publishAutomationEvent(...)`
  dans un service métier ne déclenche RIEN tant que sa clé n'est pas
  ajoutée à cette liste — vérifier les deux avant de supposer qu'un
  évènement déclenche déjà une automatisation.
- **Les identifiants email sont PAR ORGANISATION
  (`Integration.config`, kind `EMAIL`), le fournisseur AI/LLM reste un
  réglage de DÉPLOIEMENT** (`AI_PROVIDER`/`LLM_PROVIDER`, ADR 0015/0039)
  — ne pas essayer d'ajouter une configuration par organisation pour le
  LLM sans relire l'ADR 0039 (choix explicite, alternative écartée pour
  cette phase, coût de refactor disproportionné par rapport au besoin
  réel).
- **`updateEmailIntegrationConfig` FUSIONNE, ne remplace jamais** — un
  champ secret (`smtpPassword`/`apiKey`) laissé vide dans le formulaire de
  réglages ne doit jamais effacer un identifiant déjà enregistré ; et
  `getEmailConfigPreview` ne renvoie JAMAIS un secret en clair au
  navigateur (seulement sa présence, `hasSmtpPassword`/`hasApiKey`). Tout
  nouveau réglage exposant un secret par organisation doit suivre ce même
  patron fusion + aperçu masqué.
- **`VirtualTour.leadId` est TOUJOURS dérivé de la `Mission` liée**
  (`resolveLeadIdFromMission`), jamais accepté séparément en entrée — même
  principe que d'autres dérivations strictes déjà établies dans le CRM.
- **Toute nouvelle fonctionnalité de ce périmètre doit être vérifiée au
  moins une fois par une vraie requête HTTP contre un serveur en cours
  d'exécution** — la page `/settings` (nouvelles sections Entreprise/TVA/
  logo, Email, Intelligence artificielle) et les routes
  `GET`/`PUT /api/settings/integrations/email` et
  `PUT /api/settings/organization` ont été vérifiées de bout en bout
  (connexion admin démo, rendu de page, persistance/relecture des champs,
  non-fuite des secrets) contre un serveur de développement réellement
  démarré, zéro erreur console.

## 0 decies. État de v0.9 bis (observabilité, quota IA dur, Gmail/Outlook)

Voir `docs/adr/0040` pour le détail complet des décisions. Points à
connaître pour tout nouveau code touchant ce périmètre :

- **Toujours passer par `getAIProviderForOrganization(organizationId)`
  (`src/lib/ai/index.ts`), jamais `getAIProvider()` directement, à un
  nouveau point d'appel réel de la couche IA historique** — la première
  vérifie le quota mensuel avant de retourner le fournisseur
  (`QuotaExceededError`, HTTP 429, si dépassé), la seconde ne fait aucune
  vérification. Les 4 points d'appel existants
  (`sequence-engine.ts`, `POST /api/messages/generate`,
  `POST /api/leads/[id]/analyze`, `POST /api/leads/[id]/simulate-reply`)
  suivent déjà ce patron — le reproduire pour tout nouveau point d'appel.
- **`generateAgentNarrative` (point d'entrée unique des 8 agents) vérifie
  déjà le quota et journalise le coût** — un nouvel agent ou outil qui
  appelle un LLM DOIT passer par cette fonction (déjà une règle non
  négociable depuis l'ADR 0029), jamais un appel direct à
  `getActiveLlmProvider().complete(...)`, sous peine de contourner
  silencieusement le quota IA.
- **`src/lib/ai/` (données structurées) et `src/lib/agents/llm/` (texte
  brut) restent deux abstractions séparées** — ne pas essayer de les
  fusionner ni de faire implémenter les deux interfaces par un même
  fournisseur ; voir ADR 0040 pour le raisonnement complet.
- **Un module OAuth2 générique par fournisseur d'identité**
  (`src/lib/google/oauth.ts`, `src/lib/microsoft/oauth.ts`) — toute
  nouvelle intégration Google (ex. futur Google Sheets) ou Microsoft
  (ex. futur Teams) doit réutiliser le module existant en lui passant son
  propre `scope`, jamais dupliquer la logique d'échange/renouvellement de
  jeton dans le nouveau fournisseur.
- **`EMAIL_PROVIDER` accepte désormais 6 valeurs** (`smtp`/`resend`/
  `postmark`/`brevo`/`gmail`/`outlook`) — Gmail/Outlook nécessitent en
  plus un flux de connexion OAuth (`/api/email/{gmail,outlook}/connect`
  puis `/callback`), contrairement aux 4 premiers qui ne nécessitent
  qu'une clé API/des identifiants SMTP saisis directement.
- **`Organization.aiMonthlyBudgetUsd` est `null` par défaut (illimité)**
  — ne jamais supposer qu'une organisation a un quota configuré ; toujours
  vérifier via `assertAiQuotaAvailable`/`getAIProviderForOrganization`,
  jamais lire le champ directement pour décider d'un comportement.
- **Toute nouvelle fonctionnalité de ce périmètre a été vérifiée au moins
  une fois par une vraie requête HTTP contre un serveur de production
  réellement démarré** (`/settings`, `/settings/metrics`,
  `GET /api/settings/metrics`) — voir §"Validation finale" de
  `BACKLOG.md` pour le détail des commandes exécutées.

## 0 undecies. État de v0.10 (stabilisation production, sécurité)

Voir `docs/adr/0041` pour le détail complet des décisions. Points à
connaître pour tout nouveau code touchant ce périmètre :

- **Toujours passer par `getEmailProviderForOrganization(organizationId)`
  (`src/lib/email/index.ts`), jamais `getEmailProvider()` directement, à
  un nouveau point d'appel réel d'envoi email** — même patron que
  `getAIProviderForOrganization` (v0.9 bis) : vérifie le quota quotidien
  avant de retourner le fournisseur (`QuotaExceededError`, HTTP 429, si
  dépassé). `sequence-engine.ts` fait exception : il garde son propre
  appel à `assertEmailQuotaAvailable` pour préserver ses effets de bord
  spécifiques (marquer le `Message` `FAILED` + créer un `EmailEvent`) en
  cas de dépassement, plutôt que de laisser l'erreur se propager
  génériquement.
- **Un déclencheur webhook (Workflow Engine ou Automation Engine) a
  TOUJOURS un secret** — généré automatiquement par
  `ensureWebhookTriggerConfig` (`src/lib/security/webhook-secret.ts`) à la
  (ré)indexation des liaisons de déclencheur. Ne jamais rendre ce secret
  optionnel dans un nouveau chemin de code ; comparer avec
  `timingSafeStringEqual`, jamais `===`/`!==`.
- **Les routes qui appellent `next/headers` (directement ou via
  `recordLoginEvent`/`createSession`, `src/lib/auth.ts`) ne peuvent PAS
  être invoquées directement dans Vitest** — `headers()` lève `"headers
  was called outside a request scope"` hors d'un vrai contexte de requête
  Next.js. Pour tester ces routes : vérification manuelle contre un vrai
  serveur démarré (voir `tests/auth/login-lockout.test.ts` pour un
  exemple documenté), ou restructurer la logique métier testable
  séparément de la route (ex. `assertLoginNotLocked`, testé isolément).
  Les routes qui n'appellent PAS `headers()` peuvent être importées et
  invoquées directement avec un `Request` construit (voir
  `tests/security/webhook-secret.test.ts`).
- **Le Proxy Next.js 16 (`src/proxy.ts`) tourne par défaut sur le runtime
  Node.js**, contrairement à l'ancien `middleware.ts` (Edge Runtime
  uniquement) — permet d'y placer une logique nécessitant des API Node
  complètes (ex. le rate limiter). Ne pas supposer les contraintes de
  l'Edge Runtime obsolètes sans vérifier `node_modules/next/dist/docs/`
  (voir `AGENTS.md`).
- **`tests/tenant-isolation/` couvre désormais 15 domaines** (8 avant
  v0.10 + 7 nouveaux : factures, devis, rendez-vous, automatisations,
  Communication Hub, email, calendrier) — reproduire le gabarit
  `expectNoCrossTenantLeak` pour tout nouveau domaine sensible, en
  particulier financier ou porteur de secrets.

## 0 duodecies. État de v1.0 (ouverture SaaS, API publique, Stripe Billing)

Voir `docs/adr/0042` pour le détail complet des décisions. Points à
connaître pour tout nouveau code touchant ce périmètre :

- **`/api/public/v1/**` (authentifié par clé API) et `/api/plans` (public,
  sans authentification) sont deux espaces distincts, volontairement** —
  ne jamais ajouter une route sans authentification sous
  `/api/public/v1/`, et ne jamais faire porter à une route interne d'aide
  UI (comme `/api/plans`) la sémantique d'API publique versionnée.
- **Toute nouvelle route publique en lecture doit passer par
  `withPublicApiHandler`/`withPublicApiHandlerParams`
  (`src/lib/public-api/handler.ts`)** — centralise authentification, rate
  limiting (60 req/min/clé) et conversion d'erreur ; ne jamais dupliquer
  cette logique dans la route elle-même.
- **`applyPlanToOrganization` (`src/lib/billing/plan-service.ts`) est la
  SEULE façon de faire varier les quotas d'une organisation** — ne jamais
  écrire directement `Organization.dailySendLimit`/`aiMonthlyBudgetUsd`
  ailleurs qu'à travers cette fonction, pour qu'un changement de plan
  reste la source de vérité unique.
- **Une organisation `RESTRICTED` (échec de paiement) est bloquée en
  écriture au niveau du Proxy** (`src/proxy.ts`,
  `SUBSCRIPTION_GATE_EXEMPT_PREFIXES`), jamais route par route — si une
  nouvelle route de facturation doit rester accessible à une organisation
  restreinte (pour qu'elle puisse se régulariser), ajouter son préfixe à
  cette liste plutôt que de contourner le Proxy.
- **`BillingProvider` (abonnement SaaS de l'éditeur) est un domaine
  distinct du futur `AR-0027` (paiement client final)** — ne jamais
  réutiliser `src/lib/billing/` pour un besoin de paiement client, même
  si Stripe est le fournisseur des deux côtés à terme.
- **Un mutateur de `window.location.href` dans un composant client doit
  être extrait en fonction top-level** (hors du corps du composant),
  sinon le linter `react-hooks/immutability` (react-compiler) le
  rapporte à tort comme une mutation de variable de rendu — voir
  `redirectToCheckout` dans `src/app/(app)/settings/billing/
  billing-client.tsx` pour le patron à suivre.
- **`tests/e2e/self-service-onboarding.mjs` est la 4ᵉ suite E2E**,
  exécutée en CI sur chaque pull request au même titre que les 3
  précédentes — la mettre à jour si le parcours d'inscription change.

## 1. Avant de commencer une tâche du backlog

1. Vérifier dans `BACKLOG.md` que les **prérequis** de la tâche (`AR-NNNN`)
   sont bien livrés et mergés sur `main`.
2. Vérifier dans `MILESTONES.md` que la version correspondante est bien
   celle en cours (ne pas anticiper une version future sans raison
   explicite).
3. Créer une branche courte dédiée à cette tâche (voir §3, convention de
   nommage de branche).
4. Si la tâche implique une décision structurante (nouvelle dépendance,
   nouveau modèle de données transverse, changement de pattern
   architectural) : rédiger un ADR **avant** de coder, pas après (voir
   §6).

## 2. Principe de non-régression permanent

Le MVP Provence 360 (`tests/e2e/golden-path.mjs`) est le filet de sécurité
de référence pendant toute la phase de généralisation (`v0.2` à `v1.0`).
Règle non négociable :

> Si une tâche touche à un module existant (voir liste `MOD-01` à `MOD-11`
> dans `ROADMAP.md`), le golden path doit passer **avant et après** la
> tâche, sans modification du script de test lui-même — sauf si la tâche
> ajoute explicitement un nouveau parcours (auquel cas un nouveau script,
> pas une modification du script existant).

## 3. Workflow Git

- `main` : toujours déployable, protégée, revue obligatoire, CI verte
  requise avant merge.
- Branches courtes, une par tâche de backlog, nommées
  `<type>/<AR-NNNN>-<résumé-court>` :
  - `feat/AR-0022-modele-invoice`
  - `fix/AR-0041-regression-sequence`
  - `refactor/AR-0011-lecture-config-vertical`
  - `docs/AR-0003-premier-adr`
  - `vertical/provence360/<sujet>` pour un ajustement propre à ce vertical
    une fois `MOD-02` en place.
- Commits [Conventional Commits](https://www.conventionalcommits.org/),
  référençant l'identifiant de tâche : `feat(invoice): génération de
  facture depuis un devis accepté (AR-0023)`.
- Une pull request par tâche (ou un petit groupe de tâches très liées),
  jamais une PR qui mélange plusieurs modules sans rapport.
- Description de PR structurée : contexte (quelle tâche `AR-NNNN`),
  changement, plan de test exécuté, impact sur le golden path.
- Tag sémantique (`vX.Y.Z`) à chaque jalon de `MILESTONES.md` livré en
  production.

## 4. Conventions de code

Reprises de `docs/00-AUTORUN-VISION.md` §17 et §19, rappelées ici pour
référence rapide pendant le développement :

- TypeScript strict partout, aucun `any` non justifié (commenter
  brièvement si un `any` est réellement inévitable).
- Validation Zod systématique à toute frontière : API Route Handlers,
  import CSV, configuration vertical, webhooks entrants.
- Composants React fins ; toute logique métier vit dans `src/lib/`, jamais
  dans un composant.
- Toute intégration externe (IA, email, stockage, paiement, calendrier)
  passe par une interface dédiée dans `src/lib/<domaine>/types.ts`,
  jamais d'appel SDK tiers direct ailleurs dans le code — c'est le pattern
  déjà établi par `AIProvider`/`EmailProvider`, à répliquer strictement
  pour `StorageProvider`/`PaymentProvider`/`CalendarProvider`.
- Nommage : `kebab-case` pour fichiers/dossiers, `PascalCase` pour
  composants et modèles Prisma, `camelCase` pour variables/fonctions,
  `SCREAMING_SNAKE_CASE` pour constantes globales, variables
  d'environnement et valeurs d'enum techniques.
- Jamais de préfixe `NEXT_PUBLIC_` sur une variable contenant un secret.
- Pas de `console.log` brut dans `src/` (règle de lint, voir AR-0006) —
  utiliser `src/lib/logger.ts` (pino, déjà en place depuis plusieurs
  phases). L'observabilité transversale (`MOD-16` : logs structurés,
  capture d'erreurs réelle via `src/lib/observability/error-tracking.ts`,
  métriques de base) est livrée depuis v0.9 bis — voir `ROADMAP.md`
  §1 decies et `MILESTONES.md` §v0.9 bis.

## 5. Stratégie de tests

Quatre niveaux, à prévoir systématiquement selon la nature de la tâche :

1. **Tests unitaires (Vitest)** : logique métier pure (`scoring.ts`,
   `sequence-engine.ts`, `invoicing.ts`...). Obligatoires pour tout nouveau
   fichier dans `src/lib/`.
2. **Tests de contrat** : pour toute interface fournisseur (`AIProvider`,
   `EmailProvider`, `StorageProvider`, `PaymentProvider`,
   `CalendarProvider`) — un même jeu de tests exécuté contre chaque
   implémentation (démo, réelle), garantissant qu'une nouvelle
   implémentation respecte le contrat sans avoir à deviner ses effets de
   bord.
3. **Tests d'isolation multi-tenant** : gabarit `tests/helpers/
   tenant-isolation.ts` (AR-0004) appliqué à toute nouvelle route API,
   sans exception.
4. **Tests e2e (Playwright)** : `tests/e2e/golden-path.mjs` en
   non-régression permanente ; nouveau script e2e dédié pour tout nouveau
   parcours majeur (ex. `golden-path-vertical-fictif.mjs`,
   `golden-path-facturation.mjs`).

Règle d'écriture : le test avant l'extraction, pas après, dès qu'une tâche
touche à un module existant déjà couvert par le golden path.

## 6. Architecture Decision Records (ADR)

- Emplacement : `docs/adr/NNNN-titre-court.md`, numérotation séquentielle.
- Gabarit (`docs/adr/0000-template.md`, créé en AR-0003) : Contexte,
  Décision, Conséquences, Alternatives écartées.
- Un ADR est requis avant de : introduire une nouvelle dépendance
  d'infrastructure (queue, cache, moteur de recherche), changer un pattern
  architectural établi, ou prendre une décision qui sera coûteuse à
  inverser (ex. choix `pg-boss` vs Redis, déjà tranché et documenté comme
  premier ADR réel).
- Un ADR n'est jamais réécrit rétroactivement pour "avoir eu raison" — s'il
  faut revenir sur une décision, un nouvel ADR référence l'ancien et
  explique le changement.

## 7. Definition of Done (gabarit à appliquer à chaque tâche)

Une tâche `AR-NNNN` n'est considérée terminée que si :

- [ ] le code respecte les conventions §4 ;
- [ ] les tests listés dans `BACKLOG.md` pour cette tâche sont écrits et
      passent ;
- [ ] le golden path (`tests/e2e/golden-path.mjs`) passe toujours si la
      tâche touche un module existant ;
- [ ] la CI (lint, typecheck, tests, build) est verte ;
- [ ] un ADR a été rédigé si la tâche correspond aux critères du §6 ;
- [ ] la documentation impactée est mise à jour (`docs/01-SPECIFICATION.md`
      / `docs/02-ARCHITECTURE.md` si le comportement fonctionnel ou
      l'architecture change réellement) ;
- [ ] la PR a été revue et approuvée avant merge sur `main`.

## 8. Comment ajouter un nouveau vertical métier (une fois la validation par un second vertical livrée)

> Note : `v0.3` a finalement livré le Framework des Agents IA (MOD-22,
> voir §0 ter) plutôt que cette validation, reportée — voir
> `MILESTONES.md` §"v0.3 bis". La procédure ci-dessous reste la cible,
> à affiner concrètement quand cette tâche (`AR-0015`) sera reprise.

Procédure cible, à affiner concrètement pendant cette phase (`AR-0015`) :

1. Créer un jeu de `PipelineStageDefinition` / `LeadCategoryDefinition` /
   `ServiceCatalogDefinition` pour le nouveau vertical (via l'UI
   d'administration ou un script de seed dédié).
2. Définir les gabarits de message et règles de scoring par défaut du
   vertical.
3. Ne **jamais** ajouter de branche `if (vertical === "xxx")` dans le code
   applicatif — si un besoin semble l'exiger, c'est un signal que `MOD-02`
   a une lacune de généralisation à corriger, pas que le vertical a besoin
   d'un cas spécial câblé en dur.
4. Valider avec le golden path générique (rejoué pour ce nouveau vertical,
   sur le modèle d'`AR-0015`).

## 9. Comment brancher un nouveau fournisseur externe

Procédure déjà éprouvée par `AIProvider`/`EmailProvider`, à répliquer :

1. Implémenter l'interface existante (`src/lib/<domaine>/types.ts`) dans un
   nouveau fichier `src/lib/<domaine>/<fournisseur>-provider.ts`.
2. L'enregistrer dans `src/lib/<domaine>/index.ts`, sélection par variable
   d'environnement (`AI_PROVIDER`, `EMAIL_PROVIDER`, `STORAGE_PROVIDER`,
   `PAYMENT_PROVIDER`, `CALENDAR_PROVIDER`).
3. Toute clé API/secret lu strictement côté serveur, jamais de préfixe
   `NEXT_PUBLIC_`.
4. Écrire les tests de contrat contre la nouvelle implémentation avant de
   la déployer.
5. Documenter dans `docs/02-ARCHITECTURE.md` la nouvelle implémentation
   disponible (à l'image de la section actuelle "Brancher de vrais
   fournisseurs" du `README.md`).

## 10. Environnement de développement

- Prérequis identiques au MVP actuel : Node.js ≥ 20.19, PostgreSQL ≥ 14 (ou
  `docker compose up`).
- `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run
  test:e2e:tenants`, `npm run test:e2e:automation`, `npm run db:migrate`,
  `npm run db:seed` : commandes existantes. Le noyau de jobs de
  l'Automation Engine (v0.8, `MOD-27`) n'introduit PAS de nouveau service
  `docker-compose.yml` : le worker (`processAutomationJobs`) est une
  fonction appelée par le cron applicatif
  (`POST /api/cron/process-automations`), pas un processus dédié. Un
  service `worker` séparé resterait à envisager si `v0.8 bis` (migration de
  `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/`MOD-14` vers ce noyau, voir
  `MILESTONES.md`) l'exigeait un jour, auquel cas ce guide serait mis à
  jour en conséquence.
- Toujours pouvoir démarrer l'application en mode démo (aucune clé API
  externe requise) à tout moment de la roadmap — c'est une contrainte
  permanente, pas seulement une caractéristique du MVP initial.

## 11. Revue de code — points de vigilance systématiques

À vérifier sur **chaque** pull request, indépendamment de son objet :

- Toute nouvelle route API filtre-t-elle explicitement par
  `organizationId` (directement ou via `src/lib/permissions.ts`) ?
- Toute nouvelle donnée sensible (secret, token, donnée bancaire) est-elle
  absente des logs et du code client (`NEXT_PUBLIC_*`) ?
- Toute migration Prisma destructive est-elle précédée d'une période
  d'observation documentée (voir `MILESTONES.md`, note sur `AR-0014`) ?
- Toute nouvelle intégration externe passe-t-elle par une interface dédiée
  plutôt qu'un appel SDK direct ?
- Le golden path (ou son équivalent pour un nouveau parcours) a-t-il été
  rejoué, pas seulement les tests unitaires ?

## 12. Ce que ce guide ne couvre pas (volontairement)

- Le détail des tâches à réaliser → `BACKLOG.md`.
- L'ordre et les critères de sortie des versions → `MILESTONES.md`.
- La justification des choix d'architecture et la vision produit →
  `docs/00-AUTORUN-VISION.md`, `ROADMAP.md`.
- Le développement effectif du code → hors périmètre tant que la
  conception et la planification n'ont pas été explicitement validées par
  le porteur du projet.

---

*Ce guide évolue avec le projet : toute pratique qui se répète sans être
documentée ici doit y être ajoutée par la personne qui l'introduit.*
