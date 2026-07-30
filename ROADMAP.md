# Autorun — Roadmap de développement

> Document de planification (toujours pas de développement lancé à partir de
> ce document seul — voir `BACKLOG.md` pour les tâches exécutables et
> `MILESTONES.md` pour le découpage en versions). Basé sur
> `docs/00-AUTORUN-VISION.md`, `docs/01-SPECIFICATION.md` et
> `docs/02-ARCHITECTURE.md`.

## 0. Principe directeur

Le MVP Provence 360 (Phase 0, déjà livré) reste **l'application de
référence toujours fonctionnelle**. Chaque étape de cette roadmap doit se
terminer avec une application qui démarre, dont le parcours
`tests/e2e/golden-path.mjs` passe toujours, et dont aucune fonctionnalité
existante n'a régressé. On généralise et on ajoute, on ne réécrit jamais à
blanc.

Convention d'identifiants utilisée dans ce document et dans `BACKLOG.md` :

- `MOD-NN` : module (ce document).
- `AR-NNNN` : tâche de backlog (`BACKLOG.md`), numérotée globalement dans
  l'ordre de la roadmap.
- `vX.Y` : version livrable (`MILESTONES.md`).

## 1. Fondations techniques indispensables

Avant tout module fonctionnel nouveau, trois éléments sont bloquants pour
la suite et doivent exister en premier (`MOD-00`, version `v0.1`) :

1. **CI** (lint + typecheck + tests unitaires + build) sur chaque PR — sans
   ça, toute généralisation ultérieure progresse sans filet.
2. **Convention ADR** (`docs/adr/`) — chaque décision structurante des
   modules suivants (ex. choix de `pg-boss` vs Redis) doit être tracée.
3. **Test d'isolation multi-tenant** générique et réutilisable — gabarit de
   test qui sera dupliqué à chaque nouveau module touchant des données
   sensibles.

Sans ces trois éléments, les modules suivants ne peuvent pas être validés de
façon fiable.

## 1 bis. Changement de plan explicite : v0.2 devient le multi-tenant, pas la configuration métier

La version `v0.2` initialement planifiée dans ce document (§3, `MOD-02` —
généralisation des catégories/catalogue/pipeline en configuration) a été
**remplacée, sur demande explicite**, par un nouveau module prioritaire :
`MOD-21` (modèle multi-tenant Organization/Workspace, isolation des
données, RBAC de workspace, audit). Raison : rendre Autorun capable
d'héberger plusieurs entreprises est un prérequis plus urgent que la
généralisation des règles métier d'un seul vertical.

Conséquence sur l'ordre : `MOD-02` (configuration métier) n'est pas
abandonné, seulement **reporté après `MOD-21`** — voir `MILESTONES.md`
pour le détail. Les décisions d'architecture prises pour `MOD-21` sont
documentées dans `docs/adr/0005` et `docs/adr/0006`.

## 1 ter. Changement de plan explicite : v0.3 devient le Framework des Agents, pas la validation du 2ᵉ vertical

De la même façon que pour v0.2, la version `v0.3` initialement envisagée
dans ce document (`MOD-20`, validation par un 2ᵉ vertical fictif) a été
**remplacée, sur demande explicite**, par un nouveau module prioritaire :
`MOD-22` (Framework des Agents IA — registre, cycle de vie, moteur
d'exécution, mémoire, communication, outils, permissions, scheduler,
observabilité, interface d'administration). Raison : Autorun doit devenir
une plateforme capable d'accueillir des agents IA spécialisés sans
modifier son architecture, ce qui est un prérequis pour tout agent métier
futur (Commercial, CRM, Marketing, etc.) — construire cette infrastructure
avant les agents eux-mêmes évite de la redéfinir a posteriori.

Conséquence sur l'ordre : `MOD-20` (validation 2ᵉ vertical) n'est pas
abandonné, seulement **reporté après `MOD-22`**. Aucun agent métier
(Commercial, CRM, Marketing, Comptabilité, Support, Analyse, Directeur)
n'est développé dans `MOD-22` : uniquement leur infrastructure commune.
Les décisions d'architecture prises pour `MOD-22` sont documentées dans
`docs/adr/0007`, `docs/adr/0008` et `docs/adr/0009`.

## 1 quater. Changement de plan explicite : v0.4 devient l'Agent Director, pas la facturation

La version `v0.4` initialement envisagée dans ce document (`MOD-12`
partie 1, facturation client final) a été **remplacée, sur demande
explicite**, par un nouveau module prioritaire : `MOD-23` (Agent
Director — premier agent orchestrateur, construit intégralement sur le
Framework des Agents livré en v0.3). Raison : valider que le Framework
des Agents (v0.3) est réellement suffisant pour héberger un agent réel
avant d'investir dans des agents métier ou dans de nouvelles
fonctionnalités indépendantes du Framework — un orchestrateur est le test
le plus exigeant de ce que ce Framework doit fournir (délégation, attente
de résultat, mémoire, permissions), plus exigeant que ne l'aurait été un
premier agent métier isolé.

Conséquence sur l'ordre : `MOD-12` (facturation) n'est pas abandonné,
seulement **reporté après `MOD-23`**. Le Director ne réalise aucune tâche
métier lui-même (voir §MOD-23) ; les agents métier
(Commercial/CRM/Marketing/Comptabilité/Support/Analyse/Finance/
Développement) restent hors périmètre — seuls leurs contrats/interfaces
sont préparés (voir ADR 0012). Les décisions d'architecture prises pour
`MOD-23` sont documentées dans `docs/adr/0010`, `0011`, `0012` et `0013`.

## 1 quinquies. Changement de plan explicite : v0.5 devient l'Agent Commercial, pas le paiement Stripe réel

La version `v0.5` initialement envisagée dans ce document (`MOD-12`
partie 2, paiement Stripe réel) a été **remplacée, sur demande
explicite**, par un nouveau module prioritaire : `MOD-24` (Agent
Commercial — premier agent **métier** d'Autorun, construit intégralement
sur le Framework des Agents (v0.3) et délégable par l'Agent Director
(v0.4)). Raison : prouver que le Framework/Director savent réellement
porter un agent métier complet (recherche, qualification, scoring,
génération, approbation humaine) avant d'investir davantage dans des
fonctionnalités indépendantes des agents.

Conséquence sur l'ordre : `MOD-12` partie 2 (paiement Stripe réel) n'est
pas abandonné, seulement **reporté après `MOD-24`** — de toute façon
dépendant de `MOD-12` partie 1 (facturation, socle), elle-même toujours
reportée depuis `v0.4` (voir §1 quater). `MOD-24` introduit trois
extensions génériques et réutilisables du Framework des Agents (pas
propres au Commercial) : le moteur de génération multi-fournisseur LLM
(`src/lib/agents/llm/`), le moteur de prompts versionnés
(`src/lib/agents/prompts/`), et documente le principe d'un moteur de
scoring extensible par registre (`src/lib/agents/commercial/scoring-engine.ts`).
Les décisions d'architecture prises pour `MOD-24` sont documentées dans
`docs/adr/0014`, `0015`, `0016` et `0017`.

## 1 sexies. Changement de plan explicite : v0.6 devient le Workflow Engine, pas la documentation (MOD-13)

La version `v0.6` initialement envisagée dans l'ordre logique (`MOD-13`,
gestion documentaire) a été **remplacée, sur demande explicite**, par un
nouveau module prioritaire et transversal : `MOD-25` (Workflow Engine —
moteur d'automatisation générique d'Autorun, avec éditeur visuel de type
"node editor"). Raison : Autorun ne doit pas rester "une application
contenant plusieurs agents" mais devenir "une plateforme où les agents
collaborent automatiquement" — ce module fournit l'infrastructure
d'orchestration transversale (déclencheurs, conditions, actions en
plugins, exécution séquentielle/parallèle/planifiée) sur laquelle toute
automatisation future (y compris `MOD-13`) devra s'appuyer, plutôt que de
continuer à ajouter des fonctionnalités indépendantes les unes des autres.

Conséquence sur l'ordre : `MOD-13` (documents) n'est pas abandonné,
seulement **reporté après `MOD-25`**. `MOD-25` réutilise intégralement le
Framework des Agents (v0.3) et l'Agent Director (v0.4) via une seule
action de plugin générique (`agent.call`, voir ADR 0018) — aucune
duplication de la logique d'exécution d'agent, aucun couplage fort entre
les deux systèmes (découplés par un bus d'évènements générique,
`src/lib/events/domain-events.ts`). Le mécanisme d'automatisation hérité
de Provence 360 (`AutomationRule`/`automation-engine.ts`, v0.1) n'est ni
supprimé ni migré dans cette phase — voir ADR 0022. Les décisions
d'architecture prises pour `MOD-25` sont documentées dans
`docs/adr/0018` à `0022`.

## 1 septies. Changement de plan explicite : v0.7 devient le système d'intelligence documentaire, pas le calendrier (MOD-14)

La version `v0.7` initialement envisagée dans l'ordre logique (`MOD-14`,
calendrier) a été **remplacée, sur demande explicite**, par un nouveau
module prioritaire et transversal : `MOD-26` (système d'intelligence
documentaire — Memory Engine, Knowledge Engine, Context Engine, et
extension du Prompt Engine existant). Raison : Autorun ne doit plus
seulement exécuter des workflows, il doit comprendre une entreprise,
apprendre d'elle, mémoriser son fonctionnement et fournir automatiquement
aux agents le meilleur contexte possible — un prérequis transversal pour
tout agent futur, au même titre que le Workflow Engine (v0.6) l'a été pour
l'automatisation.

Conséquence sur l'ordre : `MOD-14` (calendrier) n'est pas abandonné,
seulement **reporté après `MOD-26`**. `MOD-26` s'intègre au Framework des
Agents (v0.3) au seul point d'appel IA réellement existant aujourd'hui —
`generateNarrative` (Agent Commercial, v0.5) — sans dupliquer ni modifier
la mémoire propre de Director/Commercial (`AgentMemoryEntry`, v0.3, non
touchée — voir ADR 0023) ni le Workflow Engine/Scheduler (qui n'appellent
jamais de LLM directement, l'intégration est transitive via
`agent.call`/`runAgentToCompletion`). Le Prompt Engine (v0.5) n'est pas
dupliqué : `PromptTemplate`/`prompt-engine.ts` sont étendus sur place
(locale, héritage, schéma de variables typé — voir ADR 0028). Aucune
extension `pgvector` n'étant disponible dans l'environnement, la base
vectorielle par défaut stocke les embeddings en `Float[]` Postgres natif
avec similarité cosinus calculée côté application (voir ADR 0025). Les
décisions d'architecture prises pour `MOD-26` sont documentées dans
`docs/adr/0023` à `0029`.

## 1 octies. Changement de plan explicite : v0.8 devient l'Automation Engine Enterprise, pas la migration MOD-04/05/06/12/14 vers jobs

La version `v0.8` initialement envisagée (`MOD-15`, infrastructure de jobs
minimale, suivie d'une migration de `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/
`MOD-14` vers cette infrastructure) a été **remplacée, sur demande
explicite**, par un nouveau module prioritaire et transversal : `MOD-27`
(Automation Engine — moteur d'automatisation Enterprise complet :
Scheduler, Trigger Engine, Queue Manager, Job Executor, Retry Engine, Delay/
Timeout Manager, Event Dispatcher, Automation Registry, Condition Engine,
Lock Manager, Concurrency Manager, Priority Manager, Dead Letter Queue,
Persistence/Audit Layer). Raison : `MOD-15` visait une infrastructure de
jobs minimale au service d'un usage interne (webhooks de facturation) ; le
brief v0.8 demande un moteur comparable aux meilleurs du marché (Temporal,
n8n, Zapier, Make, GitHub Actions), utilisable par n'importe quel agent,
workflow, utilisateur ou module pour construire des automatisations
complexes sans écrire de code — un périmètre bien plus large que la seule
infrastructure technique de `MOD-15`.

Conséquence sur l'ordre : `MOD-27` **délivre entièrement le périmètre
technique de `MOD-15`** (noyau de jobs durable, Postgres par défaut,
Queue Manager compatible BullMQ/Redis/RabbitMQ/SQS/Kafka en stubs honnêtes
— voir ADR 0032) et va largement au-delà (graphe d'automatisation versionné,
26 types de déclencheurs, jobs/actions pluggables, Retry Engine avancé,
Circuit Breaker, Scheduler timezone/DST-aware, tableau de bord complet).
`MOD-15` est donc considéré **livré via `MOD-27`**, pas reporté. La
migration de `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/`MOD-14` vers ce noyau de
jobs reste, elle, à faire (aucune de ces migrations n'était réalisable sans
le noyau lui-même) — elle est désormais possible et documentée comme travail
futur (voir `BACKLOG.md`), mais hors périmètre de cette phase, qui construit
le moteur lui-même, pas ses futurs consommateurs internes. `MOD-27` coexiste
avec le Workflow Engine (`MOD-25`, v0.6) sans le modifier — voir ADR 0030.
Les décisions d'architecture prises pour `MOD-27` sont documentées dans
`docs/adr/0030` à `0037`.

## 2. Vue d'ensemble des modules

| ID | Module | État actuel | Priorité |
|---|---|---|---|
| MOD-00 | Fondations techniques & DevOps | ✅ Livré (v0.1) | Critique |
| MOD-01 | Identité & Accès | Existant (Phase 0), étendu multi-tenant (v0.2) | Haute (généralisation) |
| MOD-02 | Configuration métier / Vertical Pack | Reporté à v0.3 (voir §0 bis) | Critique |
| MOD-21 | Multi-tenant Organization/Workspace | ✅ Livré (v0.2) | Critique |
| MOD-03 | CRM Prospects | Existant (Phase 0) | Haute (généralisation) |
| MOD-04 | Analyse & Scoring IA | Existant (Phase 0) | Haute (généralisation + réel) |
| MOD-05 | Campagnes & Séquences | Existant (Phase 0) | Moyenne (généralisation) |
| MOD-06 | Communication (email) | Existant (Phase 0) | Haute (connecteurs réels) |
| MOD-07 | Suivi commercial | Existant (Phase 0) | Basse (déjà générique) |
| MOD-08 | Exécution / Production | Existant (Phase 0) | Basse (déjà générique) |
| MOD-09 | Automatisation | Existant (Phase 0) | Moyenne (généralisation) |
| MOD-10 | Conformité & Audit | Existant (Phase 0) | Haute (extension RGPD) |
| MOD-11 | Statistiques & Dashboard | Existant (Phase 0) | Basse (généralisation) |
| MOD-12 | Facturation client final | Reporté après v0.5 (voir §1 quater/§1 quinquies) | Haute |
| MOD-13 | Gestion documentaire | Reporté après v0.6 (voir §1 sexies) | Moyenne |
| MOD-14 | Calendrier | Reporté après v0.7 (voir §1 septies) | Moyenne |
| MOD-15 | Infrastructure asynchrone (jobs) | ✅ Livré via `MOD-27` (v0.8, voir §1 octies) | Haute |
| MOD-16 | Observabilité | À créer | Haute |
| MOD-17 | Sécurité avancée & conformité renforcée | À créer | Critique (avant SaaS public) |
| MOD-18 | Intégrations tierces & API publique | À créer | Moyenne |
| MOD-19 | Facturation SaaS Autorun (abonnements) | À créer | Haute (condition de v1.0) |
| MOD-20 | Vertical Pack — validation par un 2ᵉ vertical fictif | Reporté après v0.4 (voir §1 ter/§1 quater) | Critique (preuve du concept) |
| MOD-22 | Framework des Agents IA | ✅ Livré (v0.3) | Critique |
| MOD-23 | Agent Director (orchestrateur) | ✅ Livré (v0.4) | Critique |
| MOD-24 | Agent Commercial (premier agent métier) | ✅ Livré (v0.5) | Critique |
| MOD-25 | Workflow Engine (moteur d'automatisation + éditeur visuel) | ✅ Livré (v0.6) | Critique |
| MOD-26 | Intelligence documentaire (Memory/Knowledge/Context/Prompt Engine) | ✅ Livré (v0.7) | Critique |
| MOD-27 | Automation Engine (moteur d'automatisation Enterprise) | ✅ Livré (v0.8) | Critique |

## 3. Détail par module

Pour chaque module : objectif, fonctionnalités, dépendances, priorité,
risques techniques, choix d'architecture, tests à prévoir, critères de fin
(Definition of Done).

---

### MOD-00 — Fondations techniques & DevOps

- **Objectif** : donner à tous les modules suivants un socle CI/CD, de
  conventions et de gabarits de test, sans lequel toute généralisation est
  invérifiable.
- **Fonctionnalités** : pipeline CI (lint, typecheck, tests, build) sur
  chaque PR ; pipeline e2e sur merge vers `main` ; dossier `docs/adr/` avec
  premier ADR (choix déjà pris : monolithe modulaire, pg-boss avant Redis) ;
  gabarit de test d'isolation multi-tenant réutilisable ; `CODEOWNERS`
  minimal.
- **Dépendances** : aucune (premier module).
- **Priorité** : Critique.
- **Risques techniques** : sur-outiller trop tôt (pipeline trop complexe
  pour la taille actuelle de l'équipe) — mitigation : rester sur GitHub
  Actions simple, pas de matrice multi-environnement avant d'en avoir
  besoin.
- **Choix d'architecture** : CI GitHub Actions (déjà l'hébergeur du dépôt) ;
  pas d'auto-déploiement en production tant que `MOD-16` (observabilité)
  n'existe pas.
- **Tests à prévoir** : le pipeline lui-même est le test (« la CI passe » ==
  critère) ; test de fumée qui vérifie que `npm run build` réussit sur une
  base de données vide fraîchement migrée.
- **Critères de fin** : une PR de test délibérément cassée (lint qui échoue)
  est bien bloquée par la CI ; le gabarit de test d'isolation tourne et
  passe sur le module `MOD-01` existant.

---

### MOD-01 — Identité & Accès

- **Objectif** : généraliser l'authentification/RBAC actuels pour qu'ils
  restent valables quel que soit le vertical métier, et préparer
  l'extensibilité vers SSO/2FA (`MOD-17`) sans la construire tout de suite.
- **Fonctionnalités (existantes)** : inscription (création d'organisation),
  connexion, reset mot de passe, sessions, rôles (`OWNER_ADMIN`, `SALES`,
  `PROVIDER`), territoires, journal de connexion.
- **Fonctionnalités à généraliser** : rendre les libellés de rôle
  configurables par vertical à terme (`MOD-02`) sans changer les valeurs
  techniques d'enum (`MembershipRole` reste un enum technique stable, seul
  le libellé affiché change).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute (généralisation légère, pas de refonte).
- **Risques techniques** : casser une session existante en modifiant la
  table `Session`/cookie — mitigation : aucune migration destructive sur ce
  module avant `MOD-17`.
- **Choix d'architecture** : conserver les sessions maison (pas de
  bibliothèque tierce type Auth.js) tant que le SSO n'est pas requis
  (`MOD-17`, phase entreprise) — cohérent avec « pas de dépendance imposée
  avant le besoin réel ».
- **Tests à prévoir** : tests d'isolation multi-tenant (gabarit `MOD-00`)
  appliqués à toutes les routes `api/users`, `api/settings/organization`.
- **Critères de fin** : aucune route d'authentification/permission modifiée
  sans test de régression associé ; libellés de rôle lisibles depuis la
  config vertical dans l'UI (préparation `MOD-02`).

---

### MOD-02 — Configuration métier / Vertical Pack (modèle de données)

- **Objectif** : sortir ce qui est aujourd'hui codé en dur pour Provence 360
  (`LeadCategory`, `ServiceKind`, les 15 valeurs fixes de `LeadStage`) d'un
  enum Prisma global vers des données de configuration **par
  organisation**, sans changer le comportement observable du MVP actuel.
- **Fonctionnalités** : table `PipelineStageDefinition` (ordre, libellé,
  couleur, organisation ou vertical par défaut) ; table
  `LeadCategoryDefinition` ; table `ServiceCatalogDefinition` ; script de
  migration qui recrée pour Provence 360 exactement les valeurs actuelles
  (aucune régression visible) ; UI d'administration pour éditer ces
  définitions (déjà amorcée par `services-manager.tsx`,
  `territories-manager.tsx`, à étendre).
- **Dépendances** : `MOD-00`, `MOD-01`.
- **Priorité** : Critique — module bloquant pour tout le reste de la
  généralisation.
- **Risques techniques** : c'est le module le plus risqué de toute la
  roadmap (migration de données sur une table centrale, `Lead`). Mitigation :
  migration en deux temps — 1) ajouter les nouvelles tables + colonnes en
  parallèle des enums existants, sans rien retirer ; 2) basculer la
  lecture/écriture applicative ; 3) retirer les enums seulement après
  validation complète par les tests + `MOD-20`.
- **Choix d'architecture** : les enums **techniques** (statuts :
  `MessageStatus`, `QuoteStatus`, `MissionStatus`...) restent des enums
  Prisma — seuls les enums **métier** (qui varient par activité) migrent
  vers des tables de configuration.
- **Tests à prévoir** : test de non-régression complet du golden path
  Provence 360 après migration ; test qui vérifie qu'une organisation sans
  configuration explicite reçoit un jeu de valeurs par défaut cohérent
  (vertical « generic »).
- **Critères de fin** : `tests/e2e/golden-path.mjs` passe sans modification ;
  les valeurs affichées pour Provence 360 sont identiques avant/après ; une
  organisation de test peut définir des catégories différentes de Provence
  360 sans toucher au code.

---

### MOD-03 — CRM Prospects

- **Objectif** : généraliser le CRM prospects pour qu'il reste pertinent
  hors du contexte "visite virtuelle 3D" (champs spécifiques déjà
  correctement optionnels : `hasVirtualTour`, `reviewCount`...).
- **Fonctionnalités (existantes)** : `Lead`, `LeadContact`, `LeadNote`,
  `Tag`, `IdealCustomerProfile`, import CSV avec mapping/dédoublonnage.
- **Fonctionnalités à ajouter** : champs personnalisés par vertical (au
  minimum un champ `customFields: Json` déjà envisageable sans migration
  lourde) pour éviter d'ajouter une colonne Prisma à chaque nouveau
  vertical.
- **Dépendances** : `MOD-02`.
- **Priorité** : Haute.
- **Risques techniques** : sur-généraliser en `Json` libre au point de
  perdre la validation Zod — mitigation : schéma Zod dynamique généré à
  partir de la définition de champs personnalisés du vertical, jamais de
  champ non validé.
- **Choix d'architecture** : rester sur une table `Lead` unique et large
  plutôt que de la scinder par vertical (cohérent avec l'objectif « un seul
  pipeline »).
- **Tests à prévoir** : validation Zod des champs personnalisés ; test
  d'import CSV avec un mapping de colonnes différent de celui de Provence
  360.
- **Critères de fin** : un import CSV avec des colonnes non prévues à
  l'origine (propres à un autre métier) fonctionne sans modification de
  code, seulement de configuration.

---

### MOD-04 — Analyse & Scoring IA

- **Objectif** : passer de l'`AIProvider` démo à un fournisseur réel
  (Anthropic), tout en généralisant les prompts pour qu'ils s'appuient sur
  la configuration vertical (`MOD-02`) plutôt que sur du texte figé pour
  Provence 360.
- **Fonctionnalités (existantes)** : `analyzeLead`, `recommendScore`,
  `generateMessage`, `classifyReply`, `summarizeConversation`,
  `recommendNextAction`, `translate`, `generateSalesReport`,
  `estimateCostUsd`, journalisation `AIRequest`.
- **Fonctionnalités à ajouter** : implémentation `AnthropicAIProvider` ;
  gabarits de prompt paramétrés par vertical (ton, catalogue de services,
  pitch d'organisation déjà en base) ; plafond de coût dur par organisation
  (quota, pas seulement journalisation).
- **Dépendances** : `MOD-02` (prompts génériques), `MOD-15` (les appels IA
  réels doivent passer en tâche asynchrone, pas en synchrone bloquant une
  requête HTTP).
- **Priorité** : Haute.
- **Risques techniques** : dérive de coût si un vrai fournisseur est
  branché sans quota dur — mitigation : quota bloquant avant tout
  branchement réel, jamais l'inverse.
- **Choix d'architecture** : clé API strictement côté serveur ; aucun appel
  direct au SDK Anthropic hors de `src/lib/ai/anthropic-provider.ts` ;
  variable d'environnement `AI_PROVIDER=anthropic`.
- **Tests à prévoir** : tests de contrat (« étant donné cette interface
  `AIProvider`, n'importe quelle implémentation doit satisfaire ces
  invariants ») indépendants de l'implémentation ; test de dépassement de
  quota (doit bloquer, pas juste logguer).
- **Critères de fin** : bascule `AI_PROVIDER=demo` → `AI_PROVIDER=anthropic`
  sans changement de code applicatif ; quota dur vérifié par test.

---

### MOD-05 — Campagnes & Séquences

- **Objectif** : généraliser le moteur de séquences pour qu'il ne présuppose
  pas un cycle de vente "prospection immobilière/tourisme" mais reste
  paramétrable par vertical (gabarits de message).
- **Fonctionnalités (existantes)** : `Campaign`, `Sequence`,
  `SequenceStep`, `Enrollment`, moteur `sequence-engine.ts` (fenêtres
  horaires, arrêt automatique).
- **Fonctionnalités à ajouter** : gabarits de message (`templateKey`)
  résolus depuis la configuration vertical plutôt que codés en dur.
- **Dépendances** : `MOD-02`, `MOD-04`.
- **Priorité** : Moyenne.
- **Risques techniques** : régression du comportement d'arrêt automatique
  pendant la généralisation — mitigation : ce module ne touche pas à la
  logique de `stopEnrollmentsForLead`, seulement à la résolution des
  gabarits.
- **Choix d'architecture** : le moteur reste synchrone-déclenché par cron
  jusqu'à `MOD-15` ; ne pas migrer ce module vers la file de jobs avant que
  celle-ci existe (éviter le travail en double).
- **Tests à prévoir** : test de non-régression sur les fenêtres
  horaires/jours autorisés ; test qu'un gabarit inconnu pour un vertical
  donné échoue explicitement (pas de silencieux fallback vers Provence
  360).
- **Critères de fin** : une séquence configurée pour un vertical fictif de
  test (`MOD-20`) s'exécute correctement.

---

### MOD-06 — Communication (email)

- **Objectif** : ajouter de vraies implémentations `EmailProvider` (SMTP
  générique, puis Gmail/Outlook API) en plus du provider démo.
- **Fonctionnalités (existantes)** : `EmailAccount`, `Message`,
  `EmailEvent`, `Conversation`, provider démo.
- **Fonctionnalités à ajouter** : `SmtpEmailProvider` ; `GmailApiProvider` ;
  `OutlookApiProvider` ; gestion des rebonds/erreurs réelles (au-delà de la
  simulation actuelle par mot-clé `invalid`/`bounce`).
- **Dépendances** : `MOD-15` (envoi réel doit passer par la file de jobs,
  pas en synchrone), `MOD-16` (observabilité des échecs d'envoi).
- **Priorité** : Haute (nécessaire dès qu'on sort du cadre interne
  Provence 360).
- **Risques techniques** : gestion des quotas d'envoi réels et de la
  réputation d'expéditeur (SPF/DKIM/DMARC) — hors du contrôle applicatif
  pur ; mitigation : documenter les prérequis DNS dans le guide de
  déploiement, pas de solution "magique" côté code.
- **Choix d'architecture** : chaque implémentation dans un fichier dédié
  sous `src/lib/email/`, sélection par `EMAIL_PROVIDER`, jamais de logique
  spécifique fournisseur dans `sequence-engine.ts`.
- **Tests à prévoir** : tests de contrat `EmailProvider` communs à toutes
  les implémentations ; test manuel documenté (pas automatisable) pour
  vérifier la délivrabilité réelle en environnement de préproduction.
- **Critères de fin** : envoi réel via SMTP testé de bout en bout sur un
  compte de test ; bascule de provider par variable d'environnement sans
  changement de code.

---

### MOD-07 — Suivi commercial

- **Objectif** : ce module (`Task`, `Appointment`, `Opportunity`, `Quote`,
  `Service`) est déjà largement générique — le travail consiste surtout à
  le relier à `MOD-02` (catalogue de services configurable) et
  `MOD-12` (devis → facture).
- **Fonctionnalités (existantes)** : gestion complète tâches/RDV/
  opportunités/devis avec lignes de devis liées à `Service`.
- **Fonctionnalités à ajouter** : lien `Quote` → `Invoice` (préparation
  `MOD-12`).
- **Dépendances** : `MOD-02`.
- **Priorité** : Basse (peu de travail requis).
- **Risques techniques** : faibles — module déjà bien conçu.
- **Choix d'architecture** : aucun changement structurant, seulement des
  champs de liaison additifs.
- **Tests à prévoir** : test de génération d'un devis accepté déclenchant
  la préparation d'une facture (sans implémenter la facture elle-même
  avant `MOD-12`).
- **Critères de fin** : un `Quote` avec statut `ACCEPTED` référence un point
  d'extension clair pour `MOD-12` (pas de facture encore créée à ce stade).

---

### MOD-08 — Exécution / Production

- **Objectif** : ce module (`Customer`, `Mission`, `Provider`, `Territory`)
  est déjà générique (une "mission" n'est pas spécifique aux visites
  virtuelles). Aucun travail de généralisation majeur requis.
- **Fonctionnalités (existantes)** : création automatique de mission à la
  victoire d'une opportunité, attribution de prestataire par territoire.
- **Dépendances** : `MOD-02` (si le vertical définit des types de mission
  différents).
- **Priorité** : Basse.
- **Risques techniques** : aucun identifié.
- **Choix d'architecture** : aucun changement.
- **Tests à prévoir** : test de non-régression uniquement.
- **Critères de fin** : aucun changement de comportement requis pour ce
  module avant la phase SaaS (`MOD-19`).

---

### MOD-09 — Automatisation

- **Objectif** : généraliser le moteur de règles internes
  (`automation-engine.ts`) pour accepter des déclencheurs/actions définis
  par vertical, au-delà des 7 règles actuelles codées pour Provence 360.
- **Fonctionnalités (existantes)** : `AutomationRule` (déclencheur → action)
  avec 7 règles par défaut.
- **Fonctionnalités à ajouter** : registre de types de déclencheur/action
  extensible (pattern déjà proche : `triggerType`/`triggerConfig` en
  `Json`) ; validation Zod des configurations par type.
- **Dépendances** : `MOD-02`, `MOD-05`.
- **Priorité** : Moyenne.
- **Risques techniques** : une règle mal validée qui déclenche une action en
  boucle (ex. règle qui se déclenche elle-même) — mitigation : détection de
  cycle simple + limite de nombre d'exécutions par règle par jour.
- **Choix d'architecture** : garder un moteur de règles simple (pas de
  workflow visuel complet, reporté à `MOD-18`+).
- **Tests à prévoir** : test de détection de boucle ; test des 7 règles
  existantes en non-régression.
- **Critères de fin** : ajout d'une règle pour le vertical fictif de test
  (`MOD-20`) sans modification du moteur.

---

### MOD-10 — Conformité & Audit

- **Objectif** : étendre les fondations RGPD déjà solides
  (`SuppressionEntry`, `ConsentRecord`, `AuditLog`) avec le droit à l'oubli
  et l'export de données, prérequis avant toute ouverture SaaS publique.
- **Fonctionnalités (existantes)** : liste d'exclusion, consentement,
  journal d'audit immuable.
- **Fonctionnalités à ajouter** : export de toutes les données d'un
  prospect/client sur demande ; anonymisation/suppression définitive d'un
  prospect sur demande (droit à l'oubli), en conservant l'audit log requis
  légalement.
- **Dépendances** : `MOD-01`.
- **Priorité** : Haute.
- **Risques techniques** : conflit entre "droit à l'oubli" et "audit log
  immuable" — mitigation : anonymiser les champs identifiants dans
  `AuditLog` plutôt que supprimer les lignes.
- **Choix d'architecture** : fonction unique `forgetLead(leadId)`
  centralisée, jamais de suppression ad hoc dispersée dans le code.
- **Tests à prévoir** : test qu'après `forgetLead`, aucune donnée
  identifiante ne subsiste, mais que les compteurs statistiques agrégés
  restent cohérents.
- **Critères de fin** : demande de droit à l'oubli traitée de bout en bout
  et vérifiée par test automatisé.

---

### MOD-11 — Statistiques & Dashboard

- **Objectif** : généraliser `stats.ts` et les pages dashboard pour qu'elles
  restent pertinentes quel que soit le catalogue de services/catégories
  d'un vertical.
- **Fonctionnalités (existantes)** : compteurs, taux, filtres
  période/ville/catégorie/campagne/commercial.
- **Fonctionnalités à ajouter** : filtres dynamiques basés sur les
  catégories/services définis par `MOD-02` plutôt que sur les enums fixes.
- **Dépendances** : `MOD-02`.
- **Priorité** : Basse.
- **Risques techniques** : requêtes de statistiques qui deviennent plus
  coûteuses si elles doivent joindre des tables de configuration — mitigation
  : dénormalisation légère si besoin (mesurer avant d'optimiser).
- **Choix d'architecture** : conserver Recharts, pas de nouvelle
  dépendance de visualisation.
- **Tests à prévoir** : test de cohérence des agrégats après migration
  `MOD-02`.
- **Critères de fin** : dashboard fonctionnel pour le vertical fictif de
  test sans code spécifique.

---

### MOD-12 — Facturation client final

- **Objectif** : ajouter le module absent du cahier des charges initial —
  transformer un devis accepté en facture, suivre le paiement.
- **Fonctionnalités** : `Invoice` (référence, lignes, montant, statut :
  `DRAFT`/`SENT`/`PAID`/`OVERDUE`/`CANCELLED`), génération depuis un `Quote`
  accepté, relance automatique d'impayé (réutilise `MOD-09`), export
  PDF simple.
- **Fonctionnalités (étape suivante, v0.5)** : intégration Stripe pour le
  paiement en ligne réel (lien de paiement, webhook de confirmation).
- **Dépendances** : `MOD-07`, `MOD-10` (audit des transactions
  financières), `MOD-15` (webhooks Stripe traités de façon asynchrone et
  idempotente).
- **Priorité** : Haute.
- **Risques techniques** : gestion de la double-écriture (webhook Stripe
  reçu deux fois) — mitigation : idempotence stricte par clé d'événement
  Stripe, déjà le pattern utilisé par `WebhookEvent` existant.
- **Choix d'architecture** : ne jamais stocker de données de carte
  bancaire directement — tout passe par Stripe (tokenisation), conforme à
  la contrainte de sécurité §10 de la vision.
- **Tests à prévoir** : test de génération de facture depuis un devis ;
  test d'idempotence de traitement de webhook (même événement reçu deux
  fois → un seul effet) ; test de non-stockage de données bancaires.
- **Critères de fin** : un devis accepté peut être transformé en facture,
  envoyée, marquée payée (manuellement en v0.4, via Stripe en v0.5), avec
  audit complet.

---

### MOD-13 — Gestion documentaire

- **Objectif** : permettre le stockage et l'association de fichiers
  (contrats, livrables, pièces jointes) aux prospects/clients/missions.
- **Fonctionnalités** : interface `StorageProvider` (upload, download,
  suppression, URL signée temporaire) ; implémentation `LocalStorageProvider`
  (démo/self-host) et `S3StorageProvider` ; modèle `Document` (nom, type,
  taille, propriétaire polymorphe : lead/customer/mission).
- **Dépendances** : `MOD-01` (permissions d'accès aux documents),
  `MOD-10` (audit des accès aux documents sensibles).
- **Priorité** : Moyenne.
- **Risques techniques** : fuite d'accès à un document d'une autre
  organisation via une URL devinée — mitigation : URLs signées à expiration
  courte, jamais d'URL publique permanente par défaut.
- **Choix d'architecture** : interface `StorageProvider` suivant exactement
  le même pattern que `AIProvider`/`EmailProvider` (cohérence
  architecturale déjà établie).
- **Tests à prévoir** : test qu'une URL signée expirée est refusée ; test
  d'isolation multi-tenant sur l'accès aux documents.
- **Critères de fin** : upload/téléchargement/suppression fonctionnels en
  local (`LocalStorageProvider`) sans dépendance payante, bascule S3 par
  configuration.

---

### MOD-14 — Calendrier

- **Objectif** : offrir une vraie vue calendrier (au-delà de la liste de
  rendez-vous actuelle) et, en option, une synchronisation externe.
- **Fonctionnalités** : vue calendrier (jour/semaine/mois) sur
  `Appointment` existant ; interface `CalendarProvider` ; synchronisation
  Google Calendar / Outlook Calendar (lecture + écriture bidirectionnelle).
- **Dépendances** : `MOD-07` (Appointment existant), `MOD-15` (synchronisation
  périodique en tâche de fond).
- **Priorité** : Moyenne.
- **Risques techniques** : conflits de synchronisation bidirectionnelle
  (RDV modifié des deux côtés) — mitigation : stratégie "dernière
  écriture gagne" documentée explicitement en v1, résolution de conflit
  plus fine reportée en fonctionnalité future.
- **Choix d'architecture** : la vue calendrier interne fonctionne sans
  aucune intégration externe (mode démo) ; la synchronisation est une
  option additive.
- **Tests à prévoir** : test de la vue calendrier sans intégration externe ;
  test de contrat `CalendarProvider` indépendant de Google/Outlook.
- **Critères de fin** : vue calendrier utilisable sans clé API externe ;
  synchronisation Google testée sur un compte de test.

---

### MOD-15 — Infrastructure asynchrone (jobs)

- **Objectif** : sortir le traitement des séquences, des appels IA lourds,
  des imports volumineux et des webhooks du cycle requête/réponse HTTP.
- **Fonctionnalités** : intégration `pg-boss` (file de jobs sur
  PostgreSQL, pas de nouvelle brique d'infra) ; jobs :
  `process-sequences`, `send-email`, `run-ai-request`, `import-csv-large`,
  `sync-calendar`, `process-stripe-webhook` ; tableau de bord basique des
  jobs en échec (retry, dead-letter).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute — prérequis de `MOD-04`, `MOD-06`, `MOD-12`,
  `MOD-14`.
- **Risques techniques** : migration de logique synchrone existante
  (`processDueSequences`) vers asynchrone sans changer le comportement
  observable — mitigation : encapsuler d'abord la fonction existante
  telle quelle dans un job, sans la réécrire, puis optimiser ensuite si
  besoin.
- **Choix d'architecture** : `pg-boss` choisi explicitement plutôt que
  Redis/BullMQ pour cette étape (pas de nouvelle brique d'infra tant que le
  volume ne l'exige pas) — à documenter en ADR ; migration vers
  Redis/BullMQ reportée en optimisation future si le volume l'impose.
- **Tests à prévoir** : test qu'un job échoué est retenté puis mis en
  dead-letter après N tentatives ; test de non-régression du comportement
  des séquences après migration en job.
- **Critères de fin** : `POST /api/cron/process-sequences` devient un
  déclencheur de job (ou est remplacé par un scheduler interne à
  `pg-boss`), avec le même comportement observable qu'avant.

---

### MOD-16 — Observabilité

- **Objectif** : donner de la visibilité sur les erreurs et la performance
  avant toute ouverture à plusieurs organisations externes.
- **Fonctionnalités** : logs structurés (pino) remplaçant les
  `console.log` ; capture d'erreurs (Sentry ou équivalent) ; métriques de
  base (latence API, taux d'échec d'envoi email, coût IA cumulé) ;
  dashboard opérationnel minimal (au moins des logs consultables, pas
  nécessairement Grafana dès cette étape).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute.
- **Risques techniques** : fuite de données sensibles dans les logs
  (contenu d'email, prompt IA) — mitigation : politique de journalisation
  explicite (liste blanche de champs loggables), revue dédiée.
- **Choix d'architecture** : logs structurés dès ce module, pas de
  `console.log` toléré ensuite (règle ESLint dédiée).
- **Tests à prévoir** : test qu'aucune donnée sensible identifiée (mot de
  passe, token) n'apparaît dans un log ; test de capture d'une exception
  simulée par Sentry en environnement de test.
- **Critères de fin** : une erreur applicative simulée est visible dans
  l'outil de capture choisi avec assez de contexte pour être diagnostiquée
  sans accès direct au serveur.

---

### MOD-17 — Sécurité avancée & conformité renforcée

- **Objectif** : durcir l'isolation multi-tenant et la sécurité générale
  avant toute ouverture SaaS publique (`MOD-19`).
- **Fonctionnalités** : suite systématique de tests d'isolation
  multi-tenant sur *toutes* les routes API (généralisation du gabarit
  `MOD-00`) ; revue de sécurité type OWASP Top 10 ; quotas IA/email durs
  par organisation (au-delà du plafond de coût de `MOD-04`) ; préparation
  (pas obligatoirement l'implémentation complète) de 2FA/SSO pour les
  comptes entreprise.
- **Dépendances** : `MOD-01`, `MOD-04`, `MOD-06`, `MOD-16`.
- **Priorité** : Critique (condition bloquante avant `MOD-19`).
- **Risques techniques** : découvrir une fuite d'isolation tardivement,
  après ouverture publique — mitigation : ce module est explicitement une
  porte de sortie obligatoire (gate) avant `MOD-19`, pas une tâche
  optionnelle.
- **Choix d'architecture** : centraliser tout contrôle d'accès dans
  `src/lib/permissions.ts` (déjà le cas) ; interdire par convention toute
  requête Prisma sans filtre `organizationId` explicite en dehors de ce
  fichier (vérifiable par revue de code, éventuellement règle de lint
  personnalisée plus tard).
- **Tests à prévoir** : suite de tests d'isolation exhaustive (une entrée
  par route API) ; test de charge basique pour vérifier qu'un quota
  bloque effectivement au bon seuil.
- **Critères de fin** : 100 % des routes API couvertes par un test
  d'isolation multi-tenant ; rapport de revue de sécurité sans
  vulnérabilité critique ouverte.

---

### MOD-18 — Intégrations tierces & API publique

- **Objectif** : ouvrir Autorun à des intégrations externes (comptabilité,
  signature électronique, visioconférence) et à des développeurs tiers.
- **Fonctionnalités** : API publique documentée (a minima REST, OpenAPI) en
  lecture puis écriture progressive ; webhooks sortants (événements :
  prospect créé, devis accepté, facture payée...) ; premiers connecteurs
  recommandés (voir §6).
- **Dépendances** : `MOD-15` (livraison fiable des webhooks sortants avec
  retry), `MOD-17` (sécurité de l'API publique : clés API, rate limiting).
- **Priorité** : Moyenne (nécessaire pour `MOD-19` mais pas bloquante pour
  un premier stable interne).
- **Risques techniques** : surface d'attaque élargie par l'API publique —
  mitigation : clés API scopées par organisation, rate limiting dès le
  premier déploiement, jamais après coup.
- **Choix d'architecture** : versionner l'API dès la première route
  publique (`/api/public/v1/...`) pour permettre une évolution sans
  rupture ultérieure.
- **Tests à prévoir** : test de rate limiting ; test qu'une clé API d'une
  organisation ne peut accéder qu'à ses propres données.
- **Critères de fin** : au moins un connecteur tiers réel fonctionnel de
  bout en bout (webhook sortant consommé par un service externe de test).

---

### MOD-19 — Facturation SaaS Autorun (abonnements)

- **Objectif** : permettre à Autorun (l'éditeur) de facturer ses propres
  clients par abonnement, condition de l'ouverture SaaS self-service.
- **Fonctionnalités** : plans (Starter/Pro/Entreprise), Stripe Billing pour
  l'abonnement récurrent, quotas par plan (nombre d'utilisateurs, volume
  IA/email), onboarding self-service (création d'organisation sans
  intervention manuelle), page de gestion d'abonnement.
- **Dépendances** : `MOD-12` (Stripe déjà intégré côté facturation client
  final, réutilisé côté abonnement), `MOD-17` (sécurité avant ouverture
  publique), `MOD-01`.
- **Priorité** : Haute — condition de la version stable `v1.0`.
- **Risques techniques** : incohérence entre quota de plan et quota IA
  technique (`MOD-04`/`MOD-17`) si les deux mécanismes divergent —
  mitigation : un seul mécanisme de quota, paramétré par le plan, pas deux
  systèmes parallèles.
- **Choix d'architecture** : Stripe Billing plutôt qu'un moteur de
  facturation maison (ne pas réinventer la gestion de cycles de
  facturation, taxes, relances d'échec de paiement).
- **Tests à prévoir** : test de changement de plan (upgrade/downgrade) et
  d'application immédiate des nouveaux quotas ; test d'échec de paiement
  d'abonnement (passage en statut restreint, pas de suppression de
  données).
- **Critères de fin** : une organisation peut s'inscrire, choisir un plan,
  payer, et être automatiquement provisionnée avec les quotas
  correspondants, sans intervention manuelle.

---

### MOD-20 — Vertical Pack — validation par un 2ᵉ vertical fictif

- **Objectif** : module de *validation*, pas de production — prouver
  concrètement que `MOD-02` tient sa promesse ("aucune refonte majeure pour
  un nouveau métier") avant d'aller plus loin dans la roadmap.
- **Fonctionnalités** : création d'un vertical fictif de test (ex. "Cabinet
  de conseil" ou "Artisan du bâtiment") avec ses propres catégories de
  prospects, catalogue de services, gabarits de message, règles de
  scoring par défaut — entièrement par configuration.
- **Dépendances** : `MOD-02`, `MOD-03`, `MOD-05`, `MOD-09`, `MOD-11`.
- **Priorité** : Critique — ce module est un **jalon de vérité**, pas une
  fonctionnalité livrée aux utilisateurs (il peut être retiré ou gardé
  comme fixture de test après validation).
- **Risques techniques** : si ce module révèle que `MOD-02` a des lacunes,
  il faut accepter de revenir en arrière sur `MOD-02` avant de continuer —
  c'est le but recherché (mieux vaut le découvrir ici qu'en production).
- **Choix d'architecture** : ce vertical fictif sert aussi de fixture pour
  les tests de non-régression multi-vertical futurs (garder le jeu de
  données de test au-delà de la validation initiale).
- **Tests à prévoir** : le golden path complet (prospection → mission)
  rejoué avec ce vertical fictif, sans aucune ligne de code spécifique.
- **Critères de fin** : le golden path fonctionne pour les deux verticaux
  (Provence 360 et le vertical fictif) avec un seul et même code
  applicatif.

---

### MOD-21 — Multi-tenant Organization/Workspace (v0.2, priorisé avant MOD-02)

- **Objectif** : rendre Autorun capable d'héberger plusieurs entreprises,
  avec une isolation des données garantie côté serveur (jamais seulement
  côté interface), tout en gardant Provence 360 entièrement fonctionnelle
  et migrée sans perte de donnée.
- **Fonctionnalités** : modèle `Workspace` (sous-espace au sein d'une
  `Organization`, inchangée), `WorkspaceMembership` (8 rôles :
  Owner/Admin/Manager/Commercial/Opérateur/Comptable/Support/Viewer),
  `WorkspaceInvitation` (invitation + acceptation, création de compte si
  nécessaire), workspace actif persisté côté serveur
  (`Session.activeWorkspaceId`, jamais un identifiant client de confiance),
  sélecteur de workspace, pages de gestion des workspaces et de leurs
  membres, matrice de permissions (`src/lib/workspace-permissions.ts`),
  audit systématique (création, invitation, changement de rôle,
  archivage, changement de workspace actif, accès refusé).
- **Dépendances** : `MOD-00` (fondations), `MOD-01` (identité).
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - Confusion de vocabulaire (`Organization` du schéma = "Workspace" du
    produit) — mitigé par l'ADR 0005 qui documente explicitement ce choix
    et pourquoi un renommage complet a été écarté pour cette phase.
  - Chemins de création d'organisation multiples (inscription, seed de
    démonstration) devant chacun créer le workspace par défaut — un oubli
    a été détecté et corrigé pendant la vérification finale de cette
    phase (`prisma/seed.ts` ne créait pas de workspace ; corrigé avant
    livraison, voir le rapport de vérification).
  - Confiance implicite dans un identifiant transmis par le client — mitigé
    systématiquement : toute route qui reçoit un `workspaceId`/`id` depuis
    l'URL ou le corps de la requête le revérifie contre l'organisation de
    l'acteur authentifié avant tout accès (`resolveWorkspaceOrThrow`,
    `setActiveWorkspace`).
- **Choix d'architecture** : voir ADR 0005 (Organization inchangée +
  Workspace additif, pas de renommage) et ADR 0006 (rôles de workspace
  additifs, mapping de migration documenté). Deux systèmes de rôles
  cohabitent temporairement (`MembershipRole` historique, `WorkspaceRole`
  nouveau) — assumé, pas une incohérence accidentelle.
- **Tests à prévoir** (tous livrés, voir `tests/tenant-isolation/`) :
  isolation entre deux organisations, isolation entre deux workspaces
  d'une même organisation, accès autorisé/interdit avec journalisation,
  tentative de falsification d'un identifiant de workspace, changement de
  rôle, archivage (workspace par défaut protégé), cycle de vie complet
  (création, invitation, acceptation, retrait), invariants de migration
  sur les données réelles de Provence 360, et un test e2e Playwright
  dédié (`tests/e2e/two-organisations-isolation.mjs` — deux organisations,
  deux utilisateurs, vérification croisée qu'aucun ne voit les données de
  l'autre).
- **Critères de fin** : golden path Provence 360 inchangé après migration ;
  toute nouvelle organisation (inscription ou seed) reçoit automatiquement
  un workspace par défaut fonctionnel ; 100 % des tests listés ci-dessus
  passent contre une vraie base PostgreSQL.

---

### MOD-22 — Framework des Agents IA (v0.3, priorisé avant MOD-20)

- **Objectif** : donner à Autorun une infrastructure unique et uniforme
  pour héberger plusieurs centaines d'agents IA différents, sans jamais
  coder un agent « à part ». Cette phase ne livre **aucun agent métier** —
  uniquement le socle que tout agent métier futur devra utiliser.
- **Fonctionnalités** : architecture à deux niveaux `AgentDefinition`
  (catalogue global ou par organisation, aucun code exécutable) /
  `AgentInstallation` (instance par workspace, droits toujours un
  sous-ensemble plafonné de ce que la définition déclare et de ce que le
  rôle de l'acteur humain autorise) ; cycle de vie complet (installer,
  désinstaller, activer, désactiver, suspendre, reprendre) ; registre de
  runtimes en mémoire (`registerAgentRuntime`) peuplé au démarrage du
  serveur ; moteur d'exécution basé sur une file interne PostgreSQL
  (création, priorités, timeout, reprises automatiques, annulation,
  journal) ; mémoire à trois portées (temporaire à TTL, persistante,
  partagée au workspace) avec un champ `embedding` réservé mais inutilisé
  pour une vectorisation future ; système de communication inter-agents
  historisé (messages, demandes d'intervention humaine) ; registre unique
  d'outils déclaratifs, activable/désactivable par agent installé ;
  permissions vérifiées côté serveur pour chaque appel d'outil et chaque
  action sensible (réutilise `WorkspacePermission` de v0.2, aucun système
  parallèle) ; scheduler pour tâches ponctuelles, récurrentes et
  événementielles ; observabilité (statistiques d'exécution, durée, coût
  IA agrégé via `AIRequest.agentRunId`, journaux) ; interface
  d'administration (`/settings/agents`) listant agents, état,
  configuration, permissions, outils, statistiques, historiques, journaux.
- **Dépendances** : `MOD-00` (fondations), `MOD-21` (workspace, rôles,
  audit — l'installation d'un agent est toujours scopée à un workspace).
- **Priorité** : Critique — condition explicite de cette phase, prérequis
  de tout agent métier futur.
- **Risques techniques** :
  - Confiance implicite dans les droits déclarés par une définition
    d'agent — mitigé par `assertGrantsWithinDeclaredCeiling`, qui refuse
    toute installation ou mise à jour de droits dépassant à la fois le
    plafond déclaré par la définition et le rôle réel de l'acteur humain
    dans le workspace.
  - Contrainte SQL : l'unicité `(organizationId, key)` sur
    `AgentDefinition` et `(workspaceId, installationId, scope, key)` sur
    `AgentMemoryEntry` ne peut pas s'appliquer correctement quand la
    colonne nullable vaut `NULL` (deux lignes `NULL` ne sont jamais égales
    en SQL) — mitigé par une logique applicative de recherche puis
    création/mise à jour (jamais un simple `upsert`), documentée dans le
    code et dans l'ADR 0009.
  - Ordre de suppression en cascade : `AgentInstallation.definitionId` est
    en `ON DELETE RESTRICT` — toute suppression de test doit supprimer les
    organisations (qui cascadent les installations) avant les
    définitions d'agent, jamais l'inverse.
  - Isolement des tests en exécution parallèle (Vitest exécute les
    fichiers de test concurremment) : le nettoyage de fixtures de test
    doit cibler des identifiants exacts, jamais un filtre large type
    `startsWith`, sous peine de supprimer des lignes encore utilisées par
    un autre fichier de test en cours d'exécution.
- **Choix d'architecture** : voir ADR 0007 (catalogue/installation à deux
  niveaux, réutilisation de `WorkspacePermission`), ADR 0008 (file
  d'exécution interne PostgreSQL plutôt que `pg-boss` dès maintenant —
  `MOD-15` remplacera l'implémentation interne sans changer l'API
  publique du moteur d'exécution) et ADR 0009 (une seule table
  `AgentMemoryEntry` à discriminant `scope` plutôt que trois tables,
  vectorisation différée sans fournisseur externe intégré).
- **Tests à prévoir** (tous livrés, voir `tests/agents/` et
  `tests/tenant-isolation/agents.test.ts`) : cycle de vie d'installation
  (plafond de droits, transitions valides/invalides, désinstallation),
  moteur d'exécution (succès de bout en bout, refus d'outil non accordé,
  timeout, reprise automatique puis échec définitif, annulation, refus
  d'exécuter une installation non active), mémoire/communication/
  planification (portées, expiration, validation, messages,
  interventions, planifications ponctuelles), isolation multi-tenant
  (aucune fuite d'installation, d'exécution, de mémoire ou de message
  entre deux organisations ; falsification d'identifiant rejetée par
  `NotFoundError`).
- **Critères de fin** : golden path Provence 360 et isolation multi-tenant
  inchangés après cette phase ; 100 % des tests listés ci-dessus passent
  contre une vraie base PostgreSQL ; aucun agent métier livré.

---

### MOD-23 — Agent Director, premier agent orchestrateur (v0.4, priorisé avant MOD-12)

- **Objectif** : prouver que le Framework des Agents (v0.3) est
  suffisant pour héberger un vrai agent, en construisant le premier —
  un orchestrateur qui ne réalise jamais lui-même de tâche métier : il
  décide quel agent utiliser, dans quel ordre, avec quelles
  données/outils/permissions, distribue le travail, attend les résultats,
  les fusionne, gère les erreurs, et produit une réponse finale.
- **Fonctionnalités** : moteur de planification (`AgentPlan`/
  `AgentPlanStep`, DAG de dépendances validé à la création, statuts,
  durée, résultat) ; moteur de délégation (appel/attente synchrone d'un
  agent, annulation, relance avec lignée via `AgentRun.parentRunId`) ;
  décomposition heuristique de l'objectif (avec point d'extension pour
  une vraie décomposition NLU/LLM future) ; mémoire du Director
  (conversation, décisions, préférences, contexte) construite sur la
  mémoire d'agent existante (v0.3) ; tableau de bord
  (`/settings/director`) et visualisation graphique du plan (SVG) ;
  contrats (types + stubs `DRAFT`) pour les agents métier futurs
  (Commercial, CRM, Marketing, Support, Analyse, Finance, Développement),
  sans aucune implémentation.
- **Dépendances** : `MOD-22` (Framework des Agents, v0.3) — le Director
  est construit intégralement dessus, sans aucun contournement.
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - Le moteur d'exécution (v0.3) traite les reprises avec un délai de
    recul de 30 s, incompatible avec un orchestrateur qui doit attendre
    un résultat immédiatement — mitigé par un pilotage synchrone
    intra-processus dans le moteur de délégation (voir ADR 0010),
    documenté comme limite (pas de vrai parallélisme distribué).
  - **Défaut découvert en validant cette phase par un vrai test navigateur
    (pas seulement `vitest`)** : le registre en mémoire des runtimes/outils
    (v0.3) pouvait rester vide côté requête HTTP même après un démarrage
    serveur réussi, en développement **et en production** — affectait
    silencieusement tout agent installé depuis v0.3, pas seulement le
    Director. Corrigé par un enregistrement défensif au point d'usage
    (voir ADR 0013). Une erreur de sérialisation (`Prisma.Decimal` passé
    tel quel à un Client Component) a été détectée et corrigée dans la
    même passe de validation (`observability.ts`).
- **Choix d'architecture** : voir ADR 0010 (délégation synchrone
  intra-processus), ADR 0011 (décomposition heuristique, pas de LLM), ADR
  0012 (contrats des agents métier futurs sans implémentation), ADR 0013
  (enregistrement défensif du registre).
- **Tests à prévoir** (tous livrés, voir `tests/agents/director-*.test.ts`
  et `tests/tenant-isolation/director.test.ts`) : validation du DAG à la
  création, résolution des étapes prêtes, propagation en cascade des
  échecs, délégation réussie et historisée, exécution parallèle et
  séquentielle, gestion d'erreur, timeout, relance avec lignée,
  annulation, permissions manquantes, cloisonnement entre orchestrateurs,
  mémoire (conversation/décisions/préférences/contexte/résumés),
  isolation multi-tenant des plans/étapes.
- **Critères de fin** : golden path Provence 360, isolation multi-tenant
  et Framework des Agents (v0.3) inchangés après cette phase ; 100 % des
  tests listés ci-dessus passent contre une vraie base PostgreSQL ; le
  Director validé par une vraie requête HTTP contre un build de
  production (pas seulement des tests automatisés) ; aucun agent métier
  livré.

---

### MOD-24 — Agent Commercial, premier agent métier (v0.5, priorisé avant MOD-12 partie 2)

- **Objectif** : premier agent métier réel d'Autorun, gérant tout le
  cycle commercial d'un prospect (recherche, qualification,
  enrichissement, score, potentiel estimé, premier email, relance,
  proposition, devis, recommandation des prochaines actions),
  intégralement construit sur le Framework des Agents (v0.3) et délégable
  par l'Agent Director (v0.4) — aucun contournement.
- **Fonctionnalités** : pipeline à 10 étapes (`CommercialStage` :
  Nouveau/À qualifier/Qualifié/Premier contact/Relance/Rendez-vous/Devis
  envoyé/Négociation/Signé/Perdu) sur un modèle `CommercialProspect`
  générique (délibérément distinct du `Lead` de Provence 360, voir ADR
  0014) ; moteur de scoring extensible par registre, 9 facteurs par
  défaut (taille, secteur, présence web, qualité du site, présence
  Google, présence réseaux sociaux, historique, potentiel, probabilité de
  conversion) ; moteur de génération LLM générique multi-fournisseur
  (`LlmProvider`, 7 adaptateurs réels — OpenAI/Anthropic/Google/Mistral/
  OpenRouter/Azure/Ollama — aucun câblé en dur, voir ADR 0015) ; moteur de
  prompts versionnés en base (`PromptTemplate`, voir ADR 0016) ; 11 outils
  déclaratifs (`commercial.*`), un par capacité, chacun vérifié par
  permission de workspace en plus du plafond de l'installation ; système
  d'approbation (`CommercialAction`, toujours `PENDING_APPROVAL` par
  défaut, jamais d'envoi automatique) avec architecture de mode autonome
  prête mais désactivée par défaut (voir ADR 0017) ; mémoire commerciale
  (historique/emails/devis structurés via `CommercialProspect`/
  `CommercialAction`, préférences/objections via la mémoire d'agent
  existante) ; tableau de bord `/commercial`.
- **Dépendances** : `MOD-22` (Framework des Agents, v0.3), `MOD-23`
  (Agent Director, v0.4 — délégation testée de bout en bout).
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - Tentation de réutiliser `Lead`/`LeadCategory` (déjà riches) — écartée
    car spécifiques au vertical photographie 360° de Provence 360 ; voir
    ADR 0014 pour l'arbitrage complet.
  - Sortie libre d'un LLM difficile à parser de façon fiable pour des
    champs structurés (sujet, montant) — mitigé en gardant ces champs
    toujours calculés par le code appelant, jamais extraits du texte
    généré (voir ADR 0015).
  - Risque qu'une action soit envoyée sans validation humaine — mitigé
    par `PENDING_APPROVAL` par défaut sur toute création d'action,
    vérifié explicitement par test, et par la séparation stricte entre
    "approuver" et "envoyer" (voir ADR 0017).
- **Choix d'architecture** : voir ADR 0014 (modèle de prospect générique),
  ADR 0015 (abstraction LLM générique, distincte de l'`AIProvider`
  existant de Provence 360), ADR 0016 (moteur de prompts versionné en
  base), ADR 0017 (approbation par défaut, architecture de mode autonome).
- **Tests à prévoir** (tous livrés, voir `tests/agents/commercial-*.test.ts`
  et `tests/tenant-isolation/commercial.test.ts`) : qualification
  (transition de pipeline), scoring (9 facteurs + extensibilité du
  registre), génération (moteur LLM + prompts, toujours en attente
  d'approbation), délégation réelle depuis le Director (cycle complet
  bout en bout), mémoire (objections mémorisées et réutilisées), permissions
  (refus d'un devis sans `MANAGE_FINANCE`), reprise automatique après
  échec du fournisseur LLM, journalisation, mode autonome (jamais
  d'envoi automatique même activé), isolation multi-tenant des prospects/
  actions.
- **Critères de fin** : golden path Provence 360, isolation multi-tenant
  et Framework des Agents/Director inchangés après cette phase ; 100 % des
  tests listés ci-dessus passent contre une vraie base PostgreSQL ; le
  cycle complet d'un prospect validé par une vraie requête HTTP contre le
  serveur (pas seulement des tests automatisés) ; aucune action envoyée
  automatiquement par défaut ; aucun autre agent métier livré.

### MOD-25 — Workflow Engine, moteur d'automatisation transversal (v0.6, priorisé avant MOD-13)

- **Objectif** : moteur d'automatisation générique et professionnel,
  indépendant de tout module métier, sur lequel toute automatisation
  future doit s'appuyer — pas une simple application contenant plusieurs
  agents, mais une plateforme où les agents collaborent automatiquement.
- **Fonctionnalités** : workflows versionnés (`WorkflowDefinition`/
  `WorkflowVersion`, créés/modifiés/versionnés/activés/désactivés/clonés/
  exportés/importés/archivés) ; éditeur visuel de type "node editor"
  (glisser-déposer, connexion par clic, zoom/déplacement du canevas,
  validation graphique côté client et serveur) pour 7 types de blocs
  (déclencheur/condition/action/boucle/attente/sous-workflow/fin) ;
  registre extensible de 14 déclencheurs (évènements applicatifs,
  planification cron réelle, webhook, action utilisateur, fin d'un autre
  workflow, exécution d'un agent) ; système de plugins pour les actions
  (6 actions réellement implémentées — appel d'agent générique, envoi
  d'email, appel API sortant, notification, sous-workflow, définition de
  variable — et 7 actions honnêtement déclarées "non encore
  implémentées", voir ADR 0022) ; moteur de règles combinables
  (égalité/différence/comparaisons/ET/OU/NON/dates/regex/variables/
  permissions, plus un point d'extension par opérateur personnalisé) ;
  système complet de variables (workflow/contexte/utilisateur/
  organisation/workspace/agents/résultats/API/formulaires) avec
  inspecteur dans l'éditeur ; moteur d'exécution ré-entrant gérant
  séquentiel, parallèle, attente, timeout, annulation, reprise, retry,
  compensation/rollback logique, avec statut et journal par étape ;
  gestion avancée des erreurs (retry, ignorer, branche alternative,
  notifier, arrêt, escalade vers l'Agent Director) ; 10 templates prêts à
  l'emploi et clonables ; tableau de bord (`/workflows` : actifs/
  inactifs, historique, temps d'exécution, taux de succès/échec, files
  d'attente, exécutions en cours, goulots d'étranglement) ; API complète
  (CRUD, activation, déclenchement manuel, historique, relecture,
  duplication).
- **Dépendances** : `MOD-22` (Framework des Agents, v0.3), `MOD-23`
  (Agent Director, v0.4 — seule intégration via l'action générique
  `agent.call`, aucune logique d'agent dupliquée).
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - "Exécuter un script" demandé littéralement aurait ouvert un canal
    d'exécution de code arbitraire dans une plateforme multi-tenant —
    remplacé par un moteur d'expressions sûr et une action `variable.set`
    couvrant le même besoin fonctionnel sans le risque (voir ADR 0020).
  - Risque de coupler fortement le Workflow Engine et le Framework des
    Agents — mitigé par un bus d'évènements générique
    (`src/lib/events/domain-events.ts`) et une action `agent.call`
    générique, jamais d'import direct d'un service d'agent métier (voir
    ADR 0018).
  - Reprise après interruption d'un graphe arbitraire (boucles,
    sous-workflows, branches) plus complexe que pour une file simple —
    limites documentées et testées explicitement (jointure "OU", boucle
    non-résumable finement, sous-workflow suspendu non pris en charge —
    voir ADR 0019) plutôt que découvertes en production.
- **Choix d'architecture** : voir ADR 0018 (graphe versionné + registres
  déclaratifs, découplage par bus d'évènements), ADR 0019 (sémantique du
  moteur d'exécution et ses limites assumées), ADR 0020 (moteur
  d'expressions sûr au lieu d'un script arbitraire), ADR 0021 (analyseur
  cron réel), ADR 0022 (`AutomationRule` hérité, non migré).
- **Tests à prévoir** (tous livrés, voir `tests/workflows/*.test.ts` et
  `tests/tenant-isolation/workflows.test.ts`) : déclencheurs (évènement,
  cron, fin d'exécution d'agent via le bus d'évènements), conditions (tous
  les opérateurs + combinaison récursive + opérateur personnalisé),
  variables (résolution de chemin + interpolation `{{ }}`), actions
  (agent réel, HTTP simulé, email, notification, variable, échec explicite
  des actions non implémentées), parallélisme (branches indépendantes),
  timeouts (action dépassant son délai), reprises (retry avec backoff,
  suspension/reprise après attente, branche d'erreur, compensation
  logique), permissions (`MANAGE_WORKFLOWS` par rôle), multi-tenant
  (isolation stricte + rejet d'un id falsifié), communications avec les
  agents (délégation réelle via `agent.call`).
- **Critères de fin** : golden path Provence 360, isolation multi-tenant,
  Framework des Agents/Director et Agent Commercial inchangés après cette
  phase ; 100 % des tests listés ci-dessus passent contre une vraie base
  PostgreSQL ; un workflow cloné depuis un template, activé et déclenché
  validé par une vraie requête HTTP contre le serveur (pas seulement des
  tests automatisés) ; aucune régression sur les 157 tests existants.

### MOD-26 — Intelligence documentaire, Memory/Knowledge/Context/Prompt Engine (v0.7, priorisé avant MOD-14)

- **Objectif** : Autorun ne se contente plus d'exécuter des workflows —
  quatre moteurs indépendants et modulaires lui permettent de mémoriser le
  fonctionnement d'une entreprise, d'indexer sa documentation, de
  rechercher dans cette connaissance et de sélectionner automatiquement le
  meilleur contexte avant tout appel IA. Indépendant de tout fournisseur
  IA (abstractions uniquement) ; aucun agent ne doit gérer lui-même sa
  mémoire ou son contexte.
- **Fonctionnalités** :
  - **Memory Engine** (`src/lib/memory/`) : mémoire multi-niveaux
    (utilisateur/organisation/workspace/agent/workflow/conversation/tâche)
    croisée avec une nature (long terme/temporaire/décisionnelle/
    documentaire/préférences), versionnée (jamais modifiée en place),
    avec TTL/expiration/archivage/purge et résumé automatique (compression
    via le moteur LLM générique au-delà d'un seuil de taille) ;
    `AgentMemoryEntry` (v0.3, Director/Commercial) reste distinct et
    inchangé (voir ADR 0023).
  - **Knowledge Engine** (`src/lib/knowledge/`) : indexation de 19 types
    de sources (`KnowledgeSourceType`), pipeline d'ingestion par registre
    de parseurs extensible (texte natif et sérialisation d'enregistrements
    CRM/Devis/Conversation/Décision/Workflow/Log ; stubs honnêtes pour
    PDF/Word/Excel/PowerPoint/Facture et Image/Audio/Vidéo — voir ADR
    0027) ; moteur d'indexation complet (ajout, mise à jour par détection
    de changement via empreinte, suppression, renommage, déplacement,
    réindexation incrémentale/complète/en lot, priorités, historique
    journalisé) ; abstraction d'embedding (8 fournisseurs : OpenAI,
    VoyageAI, Jina, Cohere, Nomic, Ollama, HuggingFace/BGE, + un
    fournisseur de démonstration déterministe) avec cache, coût estimé et
    journal (`EmbeddingRequest`) ; abstraction de base vectorielle (8
    backends anticipés : PgVector par défaut sans extension réelle —
    `Float[]` + cosinus applicatif —, Pinecone, Qdrant, Weaviate, Chroma
    réellement implémentés, Milvus/FAISS/LanceDB honnêtement déclarés non
    implémentés, voir ADR 0025) ; moteurs de recherche plein
    texte/vectorielle/hybride (fusion de rangs réciproques)/par
    similarité, filtrables par tags/type de source/documents/organisation/
    workspace ; suivi d'usage par document (`usageCount`) pour le tableau
    de bord.
  - **Context Engine** (`src/lib/context/`) : assemblage automatique du
    contexte avant tout appel IA — documents utiles (recherche hybride
    multi-sources), préférences, mémoire d'agent, décisions passées,
    résultats précédents, historique de conversation, contraintes métier
    fournies par l'appelant — classés par priorité, puis compressés
    (troncage par priorité puis résumé via le moteur LLM) si le budget de
    tokens demandé est dépassé.
  - **Prompt Engine** : étendu sur place (v0.5, pas dupliqué — voir ADR
    0028) avec locale, héritage (`parentKey`) et schéma de variables typé.
  - **Observabilité** : tableau de bord (`/settings/knowledge`,
    `GET /api/knowledge/dashboard`) — documents par statut/type de source,
    fragments, embeddings (volume/cache/coût), indexation (temps moyen,
    succès/échec par action), documents les plus utilisés, mémoire par
    niveau/nature ; "qualité des réponses" honnêtement affichée comme
    indisponible faute de signal de retour utilisateur.
  - **Intégration** : `generateNarrative` (seul point d'appel IA du
    Framework des Agents aujourd'hui, Agent Commercial) passe désormais
    obligatoirement par `assembleContext` — voir ADR 0029. Workflow
    Engine/Scheduler en bénéficient de façon transitive (ils invoquent des
    agents, jamais un LLM directement).
- **Dépendances** : `MOD-22` (Framework des Agents, v0.3), `MOD-24` (Agent
  Commercial, v0.5 — seul point d'intégration IA existant).
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - Aucune extension `pgvector` disponible dans cet environnement — mitigé
    par un adaptateur Postgres natif équivalent fonctionnellement, avec
    limite de performance assumée et documentée (voir ADR 0025).
  - Risque qu'un agent contourne le Context Engine — mitigé en rendant le
    scope obligatoire dans la signature de `generateNarrative` (impossible
    d'appeler le fournisseur LLM sans l'avoir renseigné), mais reste une
    convention de revue de code pour tout futur point d'appel IA (voir ADR
    0029).
  - Risque de dupliquer le Prompt Engine (v0.5) ou la mémoire d'agent
    (v0.3) en croyant "créer" un nouveau moteur — tranché explicitement en
    étendant/coexistant plutôt qu'en dupliquant (voir ADR 0023/0028).
- **Choix d'architecture** : voir ADR 0023 (`AgentMemoryEntry` vs
  `MemoryEntry`), ADR 0024 (modèle document/fragment), ADR 0025 (pgvector
  indisponible), ADR 0026 (sécurité/scope strict), ADR 0027 (honnêteté des
  parseurs/backends), ADR 0028 (Prompt Engine étendu), ADR 0029 (Context
  Engine obligatoire).
- **Tests à prévoir** (tous livrés) : niveaux de mémoire, TTL/expiration/
  archivage/purge/compression (`tests/memory/memory-engine.test.ts`) ;
  ingestion/indexation (`tests/knowledge/indexing-engine.test.ts`) ;
  embeddings (`tests/knowledge/embeddings.test.ts`) ; base vectorielle
  (`tests/knowledge/vector-store.test.ts`) ; recherche plein texte/
  vectorielle/hybride/filtrée (`tests/knowledge/search.test.ts`) ;
  assemblage de contexte et compression
  (`tests/context/context-engine.test.ts`) ; intégration Context Engine ↔
  Agent Commercial (`tests/agents/context-engine-integration.test.ts`) ;
  tableaux de bord (`tests/knowledge/dashboard-service.test.ts`,
  `tests/memory/dashboard-service.test.ts`) ; isolation multi-tenant
  (`tests/tenant-isolation/knowledge.test.ts`) ; performance de recherche
  (`tests/knowledge/search-performance.test.ts`).
- **Critères de fin** : golden path Provence 360, isolation multi-tenant,
  Framework des Agents/Director/Agent Commercial/Workflow Engine inchangés
  après cette phase ; 100 % des tests listés ci-dessus passent contre une
  vraie base PostgreSQL (198/198 au total, zéro régression) ; lint,
  typecheck et build de production passent ; les deux suites E2E (golden
  path, isolation multi-tenant) validées contre une instance réellement
  démarrée.

### MOD-27 — Automation Engine, moteur d'automatisation Enterprise (v0.8, priorisé avant MOD-15)

- **Objectif** : un véritable moteur d'automatisation Enterprise,
  comparable aux meilleurs du marché (Temporal, n8n, Zapier, Make, GitHub
  Actions), permettant à n'importe quel agent, workflow, utilisateur ou
  module de créer des automatisations complexes sans écrire de code.
  Coexiste avec le Workflow Engine (`MOD-25`, v0.6) sans le modifier — voir
  ADR 0030 : le Workflow Engine reste le choix pour une orchestration
  synchrone légère, l'Automation Engine pour tout ce qui doit survivre à un
  redémarrage, être audité job par job, ou passer par des files/verrous/
  limites de concurrence explicites.
- **Fonctionnalités** :
  - **Automation Registry** (`src/lib/automation/registry/`) : cycle de
    vie complet (`Automation`/`AutomationVersion`, DRAFT → ACTIVE ⇄
    INACTIVE → ARCHIVED), versionnement immuable, clonage, export/import
    JSON, indexation automatique des liaisons de déclencheur à
    l'activation.
  - **Graphe versionné** (`graph-types.ts`/`graph-validation.ts`) : 10
    types de noeuds (trigger, condition, switch, action, loop, map, wait,
    join, subautomation, end) — `switch` (branchement à N voies), `map`
    (itération PARALLÈLE, contrairement à `loop` séquentielle), `join`
    explicite avec mode `all`/`any` (referme le point laissé ouvert par
    l'ADR 0019 pour le Workflow Engine).
  - **Trigger Engine** (`trigger-engine.ts`, `triggers/`) : 26 types de
    déclencheurs déclarés (cron, date, heure, intervalle, webhook, API,
    event bus, workflow/agent terminé, email reçu, lead créé/modifié/
    supprimé, client créé, paiement reçu, document signé, utilisateur
    connecté/créé, organisation/workspace créé, import/export terminé,
    erreur détectée, webhook externe, déclencheur manuel/personnalisé) ;
    câblage réel honnête à un sous-ensemble défensable de points d'émission
    de Provence 360 (leads CRUD, auth, organisation/workspace, import CSV,
    cron, webhook, manuel) — voir ADR 0037.
  - **Job Executor** (`executor/`) : chaque noeud `action` s'exécute comme
    un `AutomationJob` durable, individuellement retryable/verrouillable/
    priorisé/dead-letterable — le différenciateur "enterprise" par rapport
    au Workflow Engine (voir ADR 0030). Exécution asynchrone de bout en
    bout : aucun point d'entrée n'attend un run jusqu'à sa fin (voir ADR
    0031).
  - **Queue Manager** (`queue/`) : abstraction multi-fournisseur
    (Postgres par défaut — `FOR UPDATE SKIP LOCKED` atomique, corrigé d'un
    bug de concurrence réel découvert par test de charge —, mémoire,
    BullMQ/Redis/RabbitMQ/SQS/Kafka en stubs honnêtes) — voir ADR 0032.
  - **Lock Manager** (`lock/`) : verrou par bail (lease), jamais un verrou
    consultatif Postgres (incompatible avec le pool de connexions Prisma)
    — voir ADR 0032.
  - **Concurrency Manager** (`concurrency/`) : limite globale de jobs
    `RUNNING`, limite par `concurrencyKey`, rate limiting en mémoire par
    processus (limite assumée en multi-instance).
  - **Retry Engine + Circuit Breaker** (`retry/`) : 7 stratégies de retry
    (exponentiel, linéaire, immédiat, manuel, conditionnel — réutilise le
    Condition Engine —, infini borné en durée, limité) ; disjoncteur à 3
    états persisté, cohérent entre plusieurs instances de worker — voir
    ADR 0033.
  - **Dead Letter Queue** (`dlq/`) : jamais une table séparée (vue sur
    `AutomationJob.status = 'DEAD_LETTERED'`), relance strictement scopée
    organisation/workspace, jamais par id seul — voir ADR 0035.
  - **Enterprise Scheduler** (`scheduler/`) : cron complexe (plages,
    listes, pas, alias), fuseau horaire/heure d'été via `Intl.DateTimeFormat`
    natif (aucune nouvelle dépendance), jours ouvrés, jours fériés,
    périodes de blackout, fenêtres d'exécution — module autonome, pas une
    extension du cron minimal du Workflow Engine — voir ADR 0036.
  - **Priority Manager** (`priority/`) : niveaux nommés (LOW/NORMAL/HIGH/
    CRITICAL) au-dessus de l'entier de priorité, simple normalisation (le
    tri reste dans le Queue Manager) — voir ADR 0036.
  - **Condition Engine** : réutilise directement le moteur d'expressions
    du Workflow Engine (`Rule`/`Expr`/`evaluateRule`), jamais dupliqué —
    voir ADR 0034.
  - **Actions/jobs pluggables** (`actions/`) : 12 gestionnaires réels
    (HTTP, email, notification, variable, agent, workflow, automation
    imbriquée, indexation Knowledge Engine, écriture Memory Engine,
    CRUD Lead) + 8 stubs honnêtes (SMS, fichier, document, client, tâche,
    devis, facture, rendez-vous — nécessitent d'extraire la logique
    métier de Provence 360 en services réutilisables).
  - **Observabilité** : tableau de bord (`/automations`,
    `GET /api/automations/dashboard`) — automatisations par statut, runs
    (succès/échec/temps moyen/min/max), jobs par statut/type (temps moyen/
    min/max, taux d'échec), retries totaux, profondeur de file, workers
    actifs (heuristique honnête), Dead Letter Queue.
  - **API REST typée** : CRUD/cycle de vie/versions d'automatisation, jobs
    (liste/détail), DLQ (liste/relance), runs (détail/annulation/relance),
    catalogue déclencheurs/actions, cron applicatif, webhook entrant —
    `src/app/api/automations/**`.
  - **UI** : liste + tableau de bord, éditeur de version (graphe en JSON),
    détail de run (jobs + journal), Dead Letter Queue — `/automations/**`,
    permission `MANAGE_AUTOMATIONS` dédiée (même distribution de rôles que
    `MANAGE_WORKFLOWS`).
- **Dépendances** : `MOD-25` (Workflow Engine, v0.6 — Condition Engine
  réutilisé), `MOD-26` (aucune dépendance directe, mais actions
  `knowledge.index`/`memory.set` réutilisent le Knowledge/Memory Engine).
- **Priorité** : Critique — condition explicite de cette phase, et
  fondation transversale pour tout l'écosystème Autorun.
- **Risques techniques** :
  - Bug de concurrence réel dans le claim atomique du Queue Manager
    Postgres (CTE imbriquée dépassant la `LIMIT` sous forte charge) —
    détecté par test de charge dédié avant livraison, corrigé, gardé sous
    régression — voir ADR 0032.
  - Disjoncteur avec clé globale partagée pouvant provoquer une fausse
    ouverture cumulative entre suites de test parallèles utilisant le même
    type de job — détecté et corrigé (clés de test dédiées par fichier) —
    voir ADR 0033.
  - Risque qu'un run enfant (`subautomation`/`automation.call`) reste
    bloqué faute de notification à son parent — mitigé par une
    notification explicite du parent à chaque transition terminale du run
    enfant — voir ADR 0031.
- **Choix d'architecture** : voir ADR 0030 (coexistence + noyau de jobs),
  ADR 0031 (exécution asynchrone, registre vs exécuteur), ADR 0032 (Queue
  Manager Postgres, Lock Manager par bail), ADR 0033 (Circuit Breaker
  persisté), ADR 0034 (Condition Engine/Event Dispatcher réutilisés), ADR
  0035 (DLQ scopée tenant), ADR 0036 (Scheduler autonome, Priority
  Manager), ADR 0037 (honnêteté du câblage des déclencheurs).
- **Tests à prévoir** (tous livrés) : Queue Manager (`tests/automation/
  queue.test.ts`, incluant le test de charge de concurrence), Lock Manager
  (`lock.test.ts`), Concurrency Manager (`concurrency.test.ts`), Retry
  Engine + Circuit Breaker (`retry.test.ts`), DLQ (`dlq.test.ts`),
  Priority Manager (`priority.test.ts`), Scheduler (`scheduler.test.ts`),
  Trigger Engine (`triggers.test.ts`, `trigger-engine.test.ts`),
  Automation Registry (`automation-service.test.ts`), actions/jobs
  (`actions.test.ts`), Job Executor (`job-executor.test.ts` — linéaire,
  branchement, loop, map, wait, subautomation, annulation, déclenchement/
  relance manuels), tableau de bord (`dashboard-service.test.ts`),
  permissions (`permissions.test.ts`) ; E2E dédié
  (`tests/e2e/automation-golden-path.mjs`).
- **Critères de fin** : golden path Provence 360, isolation multi-tenant,
  Framework des Agents/Director/Agent Commercial/Workflow Engine/
  intelligence documentaire inchangés après cette phase ; 100 % des tests
  automatisés passent contre une vraie base PostgreSQL, zéro régression ;
  lint, typecheck et build de production passent ; les trois suites E2E
  (golden path, isolation multi-tenant, Automation Engine) validées contre
  une instance réellement démarrée.

## 4. Ordre logique de développement

```
v0.1  MOD-00 (fondations)
        │
v0.2  MOD-02 (configuration métier — le plus risqué, fait tôt et isolé)
        │
v0.3  MOD-20 (validation 2ᵉ vertical) ── en parallèle : ajustements MOD-01/03/05/09/11
        │
v0.4  MOD-12 (facturation — base fonctionnelle)
        │
v0.5  MOD-12 (facturation — Stripe réel)          ── nécessite MOD-15 pour les webhooks
        │
v0.6  MOD-13 (documents)          ── peut être développé en parallèle de MOD-14
v0.7  MOD-14 (calendrier)         ── en parallèle de MOD-13 si ressources disponibles
        │
v0.8  MOD-15 (jobs) puis migration MOD-04/MOD-05/MOD-06/MOD-12/MOD-14 vers jobs
        │
v0.9  MOD-16 (observabilité) + MOD-06 (connecteurs email réels) + MOD-04 (IA réelle)
        │
v0.10 MOD-17 (sécurité avancée — porte obligatoire)
        │
v1.0  MOD-18 (API/intégrations) + MOD-19 (SaaS billing) → première version stable
```

Remarque d'ordonnancement : `MOD-15` (infrastructure de jobs) est listé en
`v0.8` pour rester didactique (un module à la fois), mais rien n'empêche de
l'avancer plus tôt si `MOD-04`/`MOD-06` réels sont priorisés avant
`MOD-12`/`MOD-13`/`MOD-14` — l'ordre strict n'est obligatoire que pour
`MOD-00 → MOD-02 → MOD-20`, le reste est réordonnable selon les priorités
business du moment (voir `MILESTONES.md` §"Flexibilité de l'ordre").

Ce diagramme reflète le plan initial de ce document. En pratique, `v0.2` a
livré `MOD-21` (multi-tenant) à la place de `MOD-02` (voir §1 bis),
`v0.3` a livré `MOD-22` (Framework des Agents) à la place de `MOD-20`
(voir §1 ter), `v0.4` a livré `MOD-23` (Agent Director) à la place de
`MOD-12` partie 1 (voir §1 quater), `v0.5` a livré `MOD-24` (Agent
Commercial) à la place de `MOD-12` partie 2 (voir §1 quinquies), et
`v0.6` a livré `MOD-25` (Workflow Engine) à la place de `MOD-13`
(voir §1 sexies), et `v0.7` a livré `MOD-26` (intelligence documentaire)
à la place de `MOD-14` (voir §1 septies), et `v0.8` a livré `MOD-27`
(Automation Engine Enterprise) — qui délivre entièrement le périmètre
technique de `MOD-15` (voir §1 octies) — à la place de la migration
initialement prévue de `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/`MOD-14` vers le
noyau de jobs ; `MOD-02`, `MOD-12`, `MOD-13`, `MOD-14` et `MOD-20` restent à
faire, désormais après `v0.8`, ainsi que la migration de ces modules vers le
noyau de jobs de `MOD-27` (possible dès maintenant, non réalisée dans cette
phase). Voir `MILESTONES.md` pour l'état réel version par version.

## 5. Éléments parallélisables

- `MOD-13` (documents) et `MOD-14` (calendrier) sont indépendants l'un de
  l'autre — deux personnes/équipes peuvent les développer en même temps.
- `MOD-16` (observabilité) peut démarrer dès `v0.1` en tâche de fond et
  progresser en continu plutôt qu'en bloc unique en `v0.9`.
- La rédaction de la documentation développeur (`DEVELOPMENT_GUIDE.md`,
  ADRs) est parallélisable à tout moment, par toute personne, sans
  dépendance de code.
- Les connecteurs `MOD-06` (SMTP, puis Gmail, puis Outlook) sont
  indépendants entre eux une fois l'interface stable — développables par
  ordre de priorité client sans se bloquer mutuellement.
- `MOD-08` (déjà générique) ne bloque et n'est bloqué par aucun autre
  module — peut être traité à tout moment s'il reste du temps disponible.

## 6. Fonctionnalités pouvant être ajoutées plus tard (report explicite)

- Éditeur de workflows visuel no-code (au-delà du moteur de règles simple
  de `MOD-09`).
- Marketplace d'intégrations et de verticaux tiers.
- Application mobile.
- i18n complète de l'interface (au-delà de la génération de messages
  multilingue déjà supportée).
- SSO/SAML et 2FA complets (amorcés en `MOD-17`, complétés après `v1.0`
  selon la demande réelle de clients entreprise).
- Isolation renforcée par base/schéma dédié pour les très gros comptes
  (au-dessus du multi-tenant standard par `organizationId`).
- Résolution fine des conflits de synchronisation calendrier
  bidirectionnelle.

## 7. Optimisations futures (post v1.0, non bloquantes)

- Migration `pg-boss` → Redis/BullMQ si le volume de jobs le justifie
  réellement (mesurer avant de migrer).
- Cache applicatif (Redis) pour les statistiques/dashboard si la charge de
  requêtes agrégées le justifie.
- Recherche plein texte avancée (Elasticsearch ou équivalent) si la
  recherche PostgreSQL standard devient limitante.
- Découpage en microservice du worker IA si son cycle de déploiement doit
  diverger fortement du reste de l'application.
- Multi-région pour la latence/conformité de données selon les marchés
  adressés.

## 8. Intégrations externes recommandées (par ordre de valeur/effort)

1. **Anthropic (Claude)** — `MOD-04`, cœur de la proposition de valeur IA.
2. **Stripe** — `MOD-12`/`MOD-19`, paiement et facturation, indispensable
   dès qu'il y a de l'argent réel en jeu.
3. **SMTP générique** — `MOD-06`, connecteur email le plus simple à livrer
   en premier (avant Gmail/Outlook, plus coûteux en intégration OAuth).
4. **Gmail API / Outlook API** — `MOD-06`, valeur élevée mais effort
   d'intégration OAuth plus important, à prioriser après SMTP.
5. **Google Calendar / Outlook Calendar** — `MOD-14`.
6. **S3 / R2 / MinIO** — `MOD-13`, stockage documentaire.
7. **Sentry** — `MOD-16`, capture d'erreurs.
8. **Mapbox ou Leaflet + fournisseur de tuiles** — carte interactive réelle
   (fonctionnalité différée, cf. `docs/01-SPECIFICATION.md` §5).

---

*Document de planification — voir `BACKLOG.md` pour les tâches détaillées,
`MILESTONES.md` pour le découpage en versions livrables, et
`DEVELOPMENT_GUIDE.md` pour les modalités concrètes de travail.*
