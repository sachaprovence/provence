# Autorun — Jalons (Milestones)

> Ce document synthétise `ROADMAP.md` (modules) et `BACKLOG.md` (tâches
> `AR-NNNN`) en jalons livrables. Chaque jalon se termine par une
> application **fonctionnelle et démontrable**, jamais par un état
> intermédiaire cassé. `v1.0` marque la première version stable.

## Comment lire ce document

Pour chaque version : objectif du jalon, modules concernés, tâches
associées, **critères de sortie** (conditions vérifiables pour déclarer le
jalon terminé), et **état fonctionnel de l'application** à l'issue du
jalon (ce qu'un utilisateur/démonstrateur peut réellement montrer).

## Flexibilité de l'ordre

L'ordre `v0.1 → v1.0` ci-dessous est la séquence par défaut recommandée.
Deux contraintes sont strictes et non négociables :

1. `v0.1` (fondations) précède tout le reste.
2. `v0.2` (configuration métier) précède `v0.3` (validation par un second
   vertical), qui doit elle-même précéder toute nouvelle fonctionnalité
   construite *au-dessus* de la configuration vertical (facturation,
   documents, etc. restent indépendants du vertical et pourraient en
   théorie être avancés avant `v0.3` si une priorité business l'exige —
   voir note en fin de section).

Entre `v0.4` et `v0.10`, l'ordre est réordonnable selon les priorités
business (ex. si un client attend la facturation avant le calendrier,
inverser `v0.4/v0.5` et `v0.7` ne casse aucune dépendance technique).
`v1.0` doit rester en dernier : elle dépend de la sécurité durcie (`v0.10`)
et de la facturation client (`v0.4`/`v0.5`).

---

## v0.1 — Fondations techniques

- **Statut : ✅ livré** (2026-07-29).
- **Objectif du jalon** : poser le socle CI/tests/conventions sans lequel
  aucune généralisation ultérieure n'est vérifiable.
- **Modules** : MOD-00.
- **Tâches** : AR-0001 à AR-0006, plus le socle technique additionnel
  documenté dans `docs/02-ARCHITECTURE.md` §8 (env, logger, erreurs, UI kit,
  contrôle de santé — voir la note en tête de la section v0.1 de
  `BACKLOG.md`).
- **Critères de sortie** :
  - [x] la CI (lint/typecheck/tests/build) bloque une PR volontairement
    cassée ;
  - [x] le pipeline e2e tourne après merge sur `main` et rejoue le golden
    path ;
  - [x] `docs/adr/` existe avec un premier ADR réel (0001 à 0004 livrés) ;
  - [x] le gabarit de test d'isolation multi-tenant est prouvé sur au moins
    une route existante (`tests/tenant-isolation/leads.test.ts`) ;
  - [x] `CODEOWNERS` est en place.
- **État fonctionnel de l'application** : le MVP Provence 360 fonctionne
  **à l'identique** (golden path rejoué avec succès, build de production
  vérifié) — les pages de connexion/inscription/réinitialisation utilisent
  désormais le nouveau kit UI, seul changement visible pour l'utilisateur
  final, sans changement de comportement.
- **Limite connue** : `npm run format:check` échoue sur le code métier
  antérieur à cette phase (non reformaté rétroactivement, voir ADR 0004) —
  volontairement pas encore intégré comme condition bloquante de la CI.
  La construction de l'image Docker n'a pas pu être testée dans cet
  environnement (démon Docker indisponible) ; validée par revue manuelle du
  `Dockerfile`/`docker-compose.yml` et par les mêmes commandes (`prisma
  generate`, `next build`, `next start`) exécutées nativement avec succès.

## v0.2 — Multi-tenant Organization/Workspace (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-29). Ce jalon a été **redéfini sur demande
> explicite** : le contenu initialement prévu ici (configuration métier /
> Vertical Pack, `MOD-02`) est reporté à une version ultérieure (voir note
> en fin de section) et remplacé par un module jugé plus prioritaire :
> rendre Autorun capable d'héberger plusieurs entreprises. Voir
> `ROADMAP.md` §1 bis et §MOD-21, ainsi que `docs/adr/0005` et `0006`.

- **Objectif du jalon** : modèle multi-tenant explicite (Organisation,
  Workspace, appartenances, rôles, permissions), isolation des données
  garantie côté serveur à toutes les couches, Provence 360 migrée comme
  premier workspace réel sans aucune perte de donnée ni régression.
- **Modules** : MOD-21 (avec extension additive de MOD-01 : `auth.ts`
  expose désormais `sessionId`).
- **Tâches** : voir `BACKLOG.md`, section v0.2 (migration Prisma, services
  `workspace-context.ts`/`workspace-service.ts`/`workspace-permissions.ts`,
  routes API `/api/workspaces/**`, UI de gestion, suite de tests).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` passe sans aucune modification de
    script, sur données fraîchement seedées ;
  - [x] toute organisation (existante migrée, ou nouvelle via inscription
    ou seed) possède exactement un workspace par défaut fonctionnel ;
  - [x] aucun `organizationId`/`workspaceId` fourni par le client n'est
    utilisé sans revérification serveur (`resolveWorkspaceOrThrow`,
    `setActiveWorkspace`) ;
  - [x] 29 tests unitaires/intégration + 2 suites e2e Playwright
    (golden path + isolation deux organisations) passent contre une
    vraie base PostgreSQL ;
  - [x] audit systématique des événements sensibles (création,
    invitation, changement de rôle, archivage, changement de workspace
    actif, accès refusé).
- **État fonctionnel de l'application** : Provence 360 reste **entièrement
  fonctionnelle** (CRM, devis, séquences, IA — golden path inchangé) ; elle
  dispose en plus d'un sélecteur de workspace, de pages de gestion des
  workspaces/membres, et d'une isolation multi-organisation démontrée par
  test e2e (deux organisations, deux utilisateurs, vérification croisée).
- **Bug détecté et corrigé pendant la vérification finale** :
  `prisma/seed.ts` ne créait pas de workspace par défaut pour
  l'organisation de démonstration (seule la route d'inscription le
  faisait) — corrigé avant livraison ; couvert désormais par
  `tests/workspace-migration.test.ts`.
- **Limite connue** : le contenu initial de `v0.2` (généralisation des
  catégories/catalogue/pipeline en configuration — `MOD-02`) n'a pas été
  traité dans cette phase ; il reste à planifier dans une version
  ultérieure (candidate naturelle : la prochaine version, dont le numéro
  exact sera fixé au moment de la reprendre, sans renuméroter par
  anticipation les jalons `v0.3`+ déjà détaillés ci-dessous).

## v0.3 — Framework des Agents IA (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`, ce jalon a été
> **redéfini sur demande explicite** : le contenu initialement prévu ici
> (validation par un second vertical fictif, `MOD-20`) est reporté à une
> version ultérieure (voir note en fin de section) et remplacé par un
> module jugé plus prioritaire : donner à Autorun l'infrastructure
> commune requise pour héberger plusieurs centaines d'agents IA
> spécialisés, sans qu'aucun agent métier ne soit encore développé. Voir
> `ROADMAP.md` §1 ter et §MOD-22, ainsi que `docs/adr/0007`, `0008`
> et `0009`.

- **Objectif du jalon** : Agent Framework professionnel et extensible —
  registre central des agents, cycle de vie complet (installer/
  désinstaller, activer/désactiver, suspendre/reprendre), moteur
  d'exécution (file, priorités, timeout, reprises automatiques,
  annulation, journal), mémoire (temporaire, persistante, partagée,
  vectorisation différée), communication inter-agents historisée, registre
  unique d'outils déclaratifs, permissions vérifiées côté serveur,
  scheduler (tâches différées/récurrentes/événementielles), observabilité,
  interface d'administration — le tout sans coder le moindre agent métier.
- **Modules** : MOD-22 (avec extension additive de MOD-01/MOD-21 :
  `AIRequest.agentRunId` pour l'agrégation future du coût IA par agent).
- **Tâches** : voir `BACKLOG.md`, section v0.3 (AR-0078 à AR-0085 :
  schéma Prisma, registres, permissions, cycle de vie d'installation,
  moteur d'exécution, mémoire/communication/scheduler, outils/bootstrap/
  observabilité, interface d'administration).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` passe sans aucune modification de
    script, sur données fraîchement seedées ;
  - [x] `tests/e2e/two-organizations-isolation.mjs` passe (multi-tenant
    toujours fonctionnel) ;
  - [x] aucune installation, exécution, mémoire ou message d'un agent
    n'est jamais accessible depuis une autre organisation ; falsification
    d'identifiant rejetée par `NotFoundError` (pas de fuite d'existence) ;
  - [x] une installation ne peut jamais détenir un outil ou une permission
    au-delà de ce que déclare sa définition ET de ce que le rôle réel de
    l'acteur humain autorise (`assertGrantsWithinDeclaredCeiling`) ;
  - [x] 51 tests unitaires/intégration (dont 22 nouveaux pour le Framework
    des Agents) passent contre une vraie base PostgreSQL ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] aucun agent métier (Commercial, CRM, Marketing, Comptabilité,
    Support, Analyse, Directeur) livré — seul un agent de diagnostic
    non-métier existe, pour valider le framework de bout en bout.
- **État fonctionnel de l'application** : Provence 360 reste **entièrement
  fonctionnelle** (golden path inchangé) et le multi-tenant reste
  fonctionnel (isolation vérifiée) ; l'application dispose en plus d'une
  interface `/settings/agents` (Owner/Admin) permettant d'installer et de
  piloter des agents IA, sans qu'aucun agent métier réel n'existe encore.
- **Limite connue** : le contenu initial de `v0.3` (validation par un
  second vertical fictif — `MOD-20`) n'a pas été traité dans cette phase ;
  il reste à planifier dans une version ultérieure, de même que les
  futurs agents métier eux-mêmes (qui devront tous passer par ce
  framework, sans exception). La vectorisation de la mémoire des agents
  n'intègre volontairement aucun fournisseur externe à ce stade (champ
  `embedding` réservé, non exploité). La reprise récurrente du scheduler
  utilise un décalage fixe (+1 heure) plutôt qu'une évaluation cron réelle
  — limitation documentée, à lever quand un vrai agent récurrent en aura
  besoin.

## v0.3 bis — Validation par un second vertical fictif (plan initial, reporté)

- **Objectif du jalon** : prouver, avant d'investir davantage, que `v0.2`
  tient sa promesse de généralisation.
- **Modules** : MOD-20, ajustements MOD-03/05/09/11.
- **Tâches** : AR-0015 à AR-0021.
- **Critères de sortie** :
  - le golden path complet (prospection → mission) rejoué avec succès pour
    un métier fictif distinct de Provence 360, sans ligne de code
    spécifique ;
  - les champs personnalisés par vertical (`customFields`) sont validés
    dynamiquement ;
  - le moteur d'automatisation accepte une règle propre au vertical fictif
    sans modification du moteur lui-même.
- **État fonctionnel de l'application** : **deux organisations de nature
  différente cohabitent** dans la même instance sans interférence
  fonctionnelle. C'est la première démonstration concrète qu'Autorun n'est
  plus un logiciel mono-métier.
- **Point de décision** : si des lacunes structurelles sont découvertes ici,
  il est normal et attendu de revenir corriger `v0.2` avant de poursuivre
  (AR-0016). Ne pas avancer sur `v0.4+` avec une base de généralisation
  fragile.

## v0.4 — Agent Director (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`/`v0.3`, ce jalon a
> été **redéfini sur demande explicite** : le contenu initialement prévu
> ici (facturation client final, socle — `MOD-12` partie 1) est reporté à
> une version ultérieure (voir note en fin de section) et remplacé par un
> module jugé plus prioritaire : construire le premier agent réel
> d'Autorun, un orchestrateur, pour prouver que le Framework des Agents
> (v0.3) tient sa promesse. Voir `ROADMAP.md` §1 quater et §MOD-23, ainsi
> que `docs/adr/0010`, `0011`, `0012` et `0013`.

- **Objectif du jalon** : Agent Director — un orchestrateur qui ne réalise
  jamais lui-même de tâche métier : il reçoit une demande, la comprend, la
  décompose en sous-tâches, choisit les agents adaptés, distribue le
  travail, attend les résultats, les fusionne, vérifie la cohérence
  globale, gère les erreurs, relance si nécessaire, et produit une réponse
  finale. Construit intégralement sur le Framework des Agents (v0.3),
  sans aucun contournement ni code spécifique en dehors de celui-ci.
- **Modules** : MOD-23 (avec extension additive de MOD-22 :
  `AgentRunTrigger.AGENT`, `AgentRun.parentRunId` désormais utilisé pour
  la lignée de reprise).
- **Tâches** : voir `BACKLOG.md`, section v0.4 (AR-0086 à AR-0093 :
  schéma Prisma, moteur de planification, moteur de délégation + outils,
  décomposition + runtime, mémoire, contrats des agents métier futurs,
  tableau de bord + graphe, correctif du registre d'agents).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` passe sans aucune modification de
    script, sur données fraîchement seedées ;
  - [x] `tests/e2e/two-organizations-isolation.mjs` passe (multi-tenant
    toujours fonctionnel) ;
  - [x] les 51 tests du Framework des Agents (v0.3) passent toujours sans
    modification de leur code (aucune régression) ;
  - [x] 21 nouveaux tests (72 au total pour le Framework + Director)
    passent contre une vraie base PostgreSQL : validation du DAG,
    délégation réussie/parallèle/séquentielle, erreur, timeout, relance
    avec lignée, annulation, permissions manquantes, cloisonnement entre
    orchestrateurs, mémoire, isolation multi-tenant des plans ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] le Director validé par une **vraie requête HTTP contre un build de
    production** (`next build && next start`), pas seulement des tests
    automatisés — voir limite ci-dessous ;
  - [x] aucun agent métier (Commercial, CRM, Marketing, Comptabilité,
    Support, Analyse, Finance, Développement) livré — seuls leurs
    contrats/stubs `DRAFT` existent.
- **État fonctionnel de l'application** : Provence 360 et le multi-tenant
  restent **entièrement fonctionnels** (golden path et isolation
  inchangés) ; l'application dispose en plus d'un Agent Director
  installable, avec tableau de bord (`/settings/director`) permettant de
  soumettre une demande, visualiser le plan généré (graphe SVG des
  délégations et dépendances), et piloter manuellement l'annulation/
  relance d'une étape.
- **Défaut découvert et corrigé pendant la vérification finale** : un test
  de bout en bout réel dans un navigateur (au-delà de la suite `vitest`
  automatisée) a révélé que le registre en mémoire des runtimes/outils du
  Framework des Agents (v0.3) pouvait rester vide côté requête HTTP —
  **y compris contre un build de production** — faisant échouer
  silencieusement l'exécution de tout agent, diagnostic compris, depuis
  v0.3. Corrigé par un enregistrement défensif au point d'usage (ADR
  0013) ; une erreur de sérialisation annexe (`Prisma.Decimal`) a été
  corrigée dans la même passe. Recommandation retenue : toute nouvelle
  fonctionnalité du Framework des Agents doit désormais être vérifiée au
  moins une fois par une vraie requête HTTP contre un build de production,
  en plus des tests automatisés.
- **Limite connue** : le contenu initial de `v0.4` (facturation client
  final — `MOD-12`) n'a pas été traité dans cette phase ; il reste à
  planifier dans une version ultérieure, de même que `MOD-20` (validation
  2ᵉ vertical, reportée depuis v0.3) et les agents métier eux-mêmes. La
  décomposition automatique de l'objectif reste une heuristique de
  correspondance de mots-clés, pas une compréhension réelle du langage
  naturel (ADR 0011) ; le pilotage de la délégation reste synchrone
  intra-processus, sans vrai parallélisme distribué (ADR 0010).

## v0.4 bis — Facturation client, socle fonctionnel (plan initial, reporté)

- **Objectif du jalon** : combler le manque identifié dans la conception
  initiale (aucune facturation) avec un flux devis → facture → suivi
  manuel du paiement.
- **Modules** : MOD-12 (partie 1).
- **Tâches** : AR-0022 à AR-0026.
- **Critères de sortie** :
  - un devis `ACCEPTED` génère une facture avec les mêmes montants ;
  - la facture est éditable, envoyable, marquable payée manuellement,
    exportable en PDF ;
  - une relance automatique d'impayé se déclenche au bon délai.
- **État fonctionnel de l'application** : le cycle commercial complet
  (prospect → client → mission → **facture**) est démontrable de bout en
  bout pour la première fois, sans encore de paiement en ligne réel.

## v0.5 — Agent Commercial (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`/`v0.3`/`v0.4`, ce
> jalon a été **redéfini sur demande explicite** : le contenu initialement
> prévu ici (facturation, paiement Stripe réel — `MOD-12` partie 2) est
> reporté à une version ultérieure (voir note en fin de section) et
> remplacé par un module jugé plus prioritaire : le premier agent
> **métier** d'Autorun. Voir `ROADMAP.md` §1 quinquies et §MOD-24, ainsi
> que `docs/adr/0014` à `0017`.

- **Objectif du jalon** : Agent Commercial — gère le cycle commercial
  complet d'un prospect (recherche, qualification, enrichissement, score,
  potentiel estimé, premier email, relance, proposition, devis,
  recommandation des prochaines actions), construit intégralement sur le
  Framework des Agents (v0.3) et délégable par l'Agent Director (v0.4),
  sans aucun contournement. Aucune action (email, devis, relance) n'est
  envoyée automatiquement sans validation humaine par défaut.
- **Modules** : MOD-24 (avec extension additive du Framework : moteur de
  génération multi-fournisseur LLM, moteur de prompts versionnés, moteur
  de scoring extensible — tous génériques, réutilisables par un futur
  agent métier).
- **Tâches** : voir `BACKLOG.md`, section v0.5 (AR-0094 à AR-0101 :
  schéma Prisma, moteur LLM, moteur de prompts, moteur de scoring, service
  + 11 outils commerciaux, runtime + promotion du stub v0.4, API/UI,
  tests).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` et
    `tests/e2e/two-organisations-isolation.mjs` passent sans modification ;
  - [x] les 72 tests du Framework/Director (v0.3/v0.4) passent toujours
    sans modification de leur code ;
  - [x] 25 nouveaux tests (97 au total) passent contre une vraie base
    PostgreSQL : qualification, scoring (9 facteurs + extensibilité),
    génération (moteur LLM + prompts versionnés), délégation réelle
    depuis le Director, mémoire (objections), permissions
    (`MANAGE_FINANCE` requis pour un devis), reprise après échec du
    fournisseur LLM, journalisation, mode autonome (jamais d'envoi
    automatique même activé), isolation multi-tenant ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] aucune action envoyée automatiquement par défaut, vérifié par
    test (`autoApproved: false`) ;
  - [x] validé par une vraie requête HTTP contre le serveur (cycle complet
    d'un prospect, du premier email jusqu'à l'affichage dans le tableau
    de bord `/commercial`), pas seulement des tests automatisés.
- **État fonctionnel de l'application** : Provence 360, le multi-tenant et
  le Framework des Agents/Director restent **entièrement fonctionnels** ;
  l'application dispose en plus d'un Agent Commercial installable, avec
  tableau de bord (`/commercial`) permettant de lancer un cycle complet
  sur un nouveau prospect, suivre le pipeline, approuver/refuser les
  emails et recommandations générés, et déclencher une nouvelle analyse.
- **Limite connue** : le contenu initial de `v0.5` (paiement Stripe réel —
  `MOD-12` partie 2) n'a pas été traité dans cette phase ; il dépend de
  toute façon de `MOD-12` partie 1 (facturation, socle), elle-même
  toujours reportée depuis `v0.4 bis`. La décomposition/génération reste
  heuristique/déterministe côté scoring et pilotée par un fournisseur de
  démonstration par défaut côté LLM (les 7 adaptateurs réels fonctionnent
  dès qu'un identifiant est fourni, mais aucun n'est configuré dans cet
  environnement). Aucune interface d'administration pour éditer les
  prompts n'a été construite (le moteur le permet, pas encore l'UI).

## v0.5 bis — Facturation, paiement en ligne réel (plan initial, reporté)

- **Objectif du jalon** : rendre le paiement client réellement encaissable,
  pas seulement suivi manuellement.
- **Modules** : MOD-12 (partie 2).
- **Tâches** : AR-0027 à AR-0030.
- **Critères de sortie** :
  - un lien de paiement Stripe fonctionnel est inclus dans l'email de
    facture ;
  - un webhook Stripe de confirmation de paiement traité deux fois ne
    produit qu'un seul effet (idempotence prouvée) ;
  - aucune donnée de carte bancaire ne transite ni n'est stockée côté
    Autorun (vérifié par un test automatisé, pas seulement une revue).
- **État fonctionnel de l'application** : un client final peut réellement
  payer une facture en ligne et voir son statut se mettre à jour
  automatiquement.

## v0.6 — Workflow Engine (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`/`v0.3`/`v0.4`/`v0.5`,
> ce jalon a été **redéfini sur demande explicite** : le contenu
> initialement prévu ici (gestion documentaire — `MOD-13`) est reporté à
> une version ultérieure (voir `v0.6 bis` ci-dessous) et remplacé par un
> module jugé plus prioritaire et transversal : le moteur d'automatisation
> d'Autorun. Voir `ROADMAP.md` §1 sexies et §MOD-25, ainsi que
> `docs/adr/0018` à `0022`.

- **Objectif du jalon** : Workflow Engine — moteur d'automatisation
  générique et professionnel, indépendant de tout module métier, avec
  éditeur visuel de type "node editor" ; Autorun devient une plateforme
  où les agents collaborent automatiquement plutôt qu'une application
  contenant plusieurs agents isolés.
- **Modules** : MOD-25 (réutilise intégralement le Framework des Agents,
  v0.3, et l'Agent Director, v0.4, via une seule action de plugin
  générique `agent.call` — aucun couplage fort).
- **Tâches** : voir `BACKLOG.md`, section v0.6 (AR-0102 à AR-0110 : schéma
  Prisma, moteur d'expressions/de règles, registres de déclencheurs et
  d'actions, moteur d'exécution ré-entrant, bus d'évènements, service de
  cycle de vie, templates + tableau de bord, API + éditeur visuel, tests).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` et
    `tests/e2e/two-organisations-isolation.mjs` passent sans modification ;
  - [x] les 97 tests du Framework/Director/Commercial (v0.3/v0.4/v0.5)
    passent toujours sans modification de leur comportement (deux
    fonctions internes ont été extraites/dédupliquées, sans changer leur
    résultat, voir ADR 0018) ;
  - [x] 60 nouveaux tests (157 au total) passent contre une vraie base
    PostgreSQL : déclencheurs (évènement, cron réel, bus d'évènements),
    conditions (tous opérateurs + combinaison récursive + opérateur
    personnalisé), variables (résolution de chemin + interpolation
    `{{ }}`), actions (agent réel, HTTP simulé, email, notification,
    échec explicite des actions non implémentées), parallélisme,
    timeouts, reprises (retry/attente/branche d'erreur/compensation
    logique), permissions (`MANAGE_WORKFLOWS`), isolation multi-tenant,
    communications réelles avec les agents ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] validé par une vraie requête HTTP contre le serveur (clonage d'un
    template, sélection de noeud dans l'éditeur, activation d'une
    version, déclenchement manuel jusqu'au run `SUCCEEDED`), pas
    seulement des tests automatisés — captures d'écran de l'éditeur et du
    détail d'exécution incluses dans le rapport de livraison.
- **État fonctionnel de l'application** : Provence 360, le multi-tenant,
  le Framework des Agents, l'Agent Director et l'Agent Commercial restent
  **entièrement fonctionnels** ; l'application dispose en plus d'un
  Workflow Engine complet avec tableau de bord (`/workflows`) : créer un
  workflow (vide ou depuis un modèle), l'éditer graphiquement, le
  versionner, l'activer/désactiver/archiver, le déclencher manuellement
  ou via un évènement/cron/webhook, suivre l'historique d'exécution
  noeud par noeud avec journal détaillé, annuler/relancer une exécution.
- **Limite connue** : "Exécuter un script" du brief est couvert
  fonctionnellement (moteur d'expressions sûr + action `variable.set`)
  mais pas littéralement — aucune exécution de code arbitraire n'est
  implémentée, choix de sécurité documenté (ADR 0020). Sept actions
  (`sms.send`, `file.write`, `document.generate`, `customer.update`,
  `task.create`, `quote.create`, `invoice.create`, `appointment.create`)
  sont déclarées mais échouent explicitement à l'exécution : aucune
  n'a de couche de service réutilisable aujourd'hui sans risquer de
  dupliquer/contourner la logique déjà présente dans les routes
  existantes de Provence 360 (ADR 0022). Le mécanisme d'automatisation
  hérité (`AutomationRule`/`automation-engine.ts`, v0.1) n'a pas été
  migré vers le Workflow Engine dans cette phase. Un corps de boucle
  interrompu reprend depuis la première itération (pas de reprise fine
  par itération) ; un sous-workflow qui passe en attente fait échouer
  explicitement l'action appelante plutôt que de propager la suspension
  au run parent (ADR 0019).

## v0.6 bis — Gestion documentaire (plan initial, reporté)

- **Objectif du jalon** : combler le deuxième manque identifié (aucun
  stockage de fichiers).
- **Modules** : MOD-13.
- **Tâches** : AR-0031 à AR-0035.
- **Critères de sortie** :
  - upload/téléchargement/suppression de document fonctionnels en mode
    démo/self-host sans clé API tierce (`LocalStorageProvider`) ;
  - une URL de téléchargement expirée est refusée ;
  - bascule vers un stockage S3 possible par simple variable
    d'environnement, testée contre un service compatible.
- **État fonctionnel de l'application** : contrats, livrables et pièces
  jointes peuvent être attachés aux prospects/clients/missions et
  téléchargés en sécurité.

## v0.7 — Calendrier

- **Objectif du jalon** : offrir une vraie vue calendrier et, en option,
  une synchronisation externe.
- **Modules** : MOD-14.
- **Tâches** : AR-0036 à AR-0039.
- **Critères de sortie** :
  - vue calendrier jour/semaine/mois fonctionnelle sans aucune intégration
    externe ;
  - synchronisation Google Calendar testée sur un compte de test réel ;
  - synchronisation Outlook Calendar testée sur un compte de test réel.
- **État fonctionnel de l'application** : les rendez-vous existants
  deviennent consultables en vue calendrier, avec option de
  synchronisation vers l'agenda personnel de l'utilisateur.
- **Note** : ce jalon peut être développé **en parallèle** de `v0.6`
  (aucune dépendance croisée) si deux développeurs sont disponibles.

## v0.8 — Infrastructure asynchrone

- **Objectif du jalon** : sortir les traitements potentiellement longs
  (séquences, IA, imports, webhooks) du cycle requête/réponse HTTP, avant
  que le volume ne le rende obligatoire dans l'urgence.
- **Modules** : MOD-15.
- **Tâches** : AR-0040 à AR-0046.
- **Critères de sortie** :
  - `pg-boss` en place, un job planifié s'exécute et un job en échec est
    retenté puis mis en dead-letter après N tentatives ;
  - le comportement des séquences est strictement identique à avant
    migration (non-régression du golden path) ;
  - un tableau de bord permet de consulter et relancer manuellement un job
    en échec.
- **État fonctionnel de l'application** : identique du point de vue
  utilisateur final, mais l'application encaisse désormais un import
  volumineux ou un pic d'envoi sans dégrader le temps de réponse HTTP.

## v0.9 — Observabilité et connecteurs réels

- **Objectif du jalon** : donner de la visibilité opérationnelle et
  remplacer les fournisseurs démo par des fournisseurs réels pour l'IA et
  l'email.
- **Modules** : MOD-16, MOD-04 (IA réelle), MOD-06 (email réel).
- **Tâches** : AR-0047 à AR-0054.
- **Critères de sortie** :
  - logs structurés sans donnée sensible détectée par test automatisé ;
  - une exception simulée est capturée avec contexte suffisant pour être
    diagnostiquée ;
  - bascule `AI_PROVIDER=demo` → `AI_PROVIDER=anthropic` sans changement de
    code, avec quota dur vérifié par test ;
  - au moins un connecteur email réel (SMTP) fonctionnel de bout en bout
    sur un compte de test.
- **État fonctionnel de l'application** : Autorun peut désormais tourner en
  conditions réelles (IA et email non simulés) pour une organisation
  pilote, avec une équipe capable de diagnostiquer un incident en
  production.

## v0.10 — Sécurité avancée (porte obligatoire avant v1.0)

- **Objectif du jalon** : ce jalon est un **gate**, pas une fonctionnalité
  — condition bloquante avant toute ouverture SaaS publique.
- **Modules** : MOD-17.
- **Tâches** : AR-0055 à AR-0058.
- **Critères de sortie** :
  - 100 % des routes API couvertes par un test d'isolation multi-tenant ;
  - rapport de revue OWASP Top 10 sans vulnérabilité critique ouverte non
    corrigée ;
  - quota email dur vérifié par test, au même standard que le quota IA
    (`v0.9`) ;
  - schéma 2FA en place (non forcé), prêt pour activation.
- **État fonctionnel de l'application** : inchangé fonctionnellement pour
  l'utilisateur ; changement de posture de sécurité mesurable et
  documenté. **`v1.0` ne peut pas démarrer avant que ce jalon soit
  entièrement clos.**

## v1.0 — Ouverture SaaS (première version stable)

- **Objectif du jalon** : permettre à une nouvelle organisation de
  s'inscrire, choisir un plan, payer, et être opérationnelle sans
  intervention manuelle — condition de "SaaS" au sens propre du terme.
- **Modules** : MOD-18, MOD-19.
- **Tâches** : AR-0059 à AR-0066.
- **Critères de sortie** :
  - API publique en lecture fonctionnelle, isolée par organisation, avec
    rate limiting actif ;
  - au moins un webhook sortant livré avec succès à un récepteur de test,
    avec retry prouvé sur échec simulé ;
  - un changement de plan applique immédiatement les nouveaux quotas ;
  - un échec de paiement d'abonnement bascule l'organisation en statut
    restreint sans perte de données ;
  - le parcours d'inscription self-service complet (compte → organisation
    → vertical → plan → paiement → provisionnement) fonctionne de bout en
    bout sans intervention manuelle ;
  - recette finale (AR-0066) passée sur un environnement de
    préproduction représentatif de la production.
- **État fonctionnel de l'application** : **première version stable
  d'Autorun** — plateforme SaaS multi-vertical, multi-tenant, avec
  facturation d'abonnement, prospection à client à facturation, sécurité
  auditée, observabilité en place. C'est le jalon qui clôt la roadmap
  initiale ; les évolutions suivantes (§"Fonctionnalités pouvant être
  ajoutées plus tard" de `ROADMAP.md`) relèvent d'un nouveau cycle de
  planification.

---

## Tableau récapitulatif

| Jalon | Nature | Visible utilisateur ? | Bloquant pour la suite ? |
|---|---|---|---|
| v0.1 | Outillage | Non | Oui (tout) |
| v0.2 | Refonte interne | Non (comportement identique) | Oui (v0.3+) |
| v0.3 | Infrastructure (Agent Framework) | Non (aucun agent métier) | Oui (tout agent métier futur) |
| v0.3 bis | Validation (reportée) | Non (jalon de preuve) | Oui (v0.4+, en pratique) |
| v0.4 | Infrastructure (premier agent orchestrateur) | Oui (tableau de bord Director) | Non (agents métier restent optionnels) |
| v0.4 bis | Fonctionnalité (reportée) | Oui | Non |
| v0.5 | Fonctionnalité (premier agent métier) | Oui (tableau de bord Commercial) | Non |
| v0.5 bis | Fonctionnalité (reportée) | Oui | Non |
| v0.6 | Infrastructure (moteur d'automatisation transversal) | Oui (éditeur + tableau de bord Workflows) | Oui (toute automatisation future) |
| v0.6 bis | Fonctionnalité (reportée) | Oui | Non |
| v0.7 | Fonctionnalité | Oui | Non |
| v0.8 | Infrastructure | Non (transparent) | Recommandé avant v0.9 (IA/email réels à fort volume) |
| v0.9 | Fonctionnalité + ops | Oui (IA/email réels) | Oui (v0.10 en dépend partiellement) |
| v0.10 | Sécurité | Non | **Oui, bloquant pour v1.0** |
| v1.0 | Ouverture SaaS | Oui | — (fin de cycle) |

---

*Voir `BACKLOG.md` pour le détail des tâches de chaque jalon et
`DEVELOPMENT_GUIDE.md` pour la façon de les exécuter au quotidien.*
