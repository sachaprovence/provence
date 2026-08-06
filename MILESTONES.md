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
inverser `v0.4/v0.5` et `v0.7 bis` ne casse aucune dépendance technique).
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

## v0.7 — Intelligence documentaire (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`/`v0.3`/`v0.4`/
> `v0.5`/`v0.6`, ce jalon a été **redéfini sur demande explicite** : le
> contenu initialement prévu ici (calendrier — `MOD-14`) est reporté à une
> version ultérieure (voir `v0.7 bis` ci-dessous) et remplacé par un
> module jugé plus prioritaire et transversal : le système d'intelligence
> documentaire d'Autorun (Memory Engine, Knowledge Engine, Context Engine,
> et extension du Prompt Engine existant). Voir `ROADMAP.md` §1 septies et
> §MOD-26, ainsi que `docs/adr/0023` à `0029`.

- **Objectif du jalon** : Autorun ne se contente plus d'exécuter des
  workflows — il comprend une entreprise, apprend d'elle, mémorise son
  fonctionnement et fournit automatiquement aux agents le meilleur
  contexte possible, via quatre moteurs indépendants du fournisseur IA.
- **Modules** : MOD-26 (réutilise le Framework des Agents, v0.3, et
  s'intègre à l'Agent Commercial, v0.5, au seul point d'appel IA existant
  aujourd'hui — aucun couplage fort, aucune duplication de la mémoire
  d'agent ni du Prompt Engine existants).
- **Tâches** : voir `BACKLOG.md`, section v0.7 (AR-0111 à AR-0122 : schéma
  Prisma Memory/Knowledge Engine, moteur de mémoire multi-niveaux,
  abstractions embeddings/bases vectorielles, pipeline de parseurs,
  moteur d'indexation, moteurs de recherche + ranking, Context Engine,
  extension du Prompt Engine, tableau de bord, intégration, tests, ADR).
- **Critères de sortie** :
  - [x] `tests/e2e/golden-path.mjs` et
    `tests/e2e/two-organizations-isolation.mjs` passent sans modification ;
  - [x] les 157 tests de v0.1 à v0.6 passent toujours sans modification de
    leur comportement (`generateNarrative` a gagné un paramètre de portée
    obligatoire, répercuté dans ses 5 points d'appel de
    `commercial-tools.ts`, sans changer le texte généré par le fournisseur
    de démonstration) ;
  - [x] 41 nouveaux tests (198 au total) passent contre une vraie base
    PostgreSQL : niveaux de mémoire/TTL/expiration/archivage/compression,
    ingestion/indexation (ajout/mise à jour/suppression/renommage/
    déplacement/réindexation/lot), embeddings (cache, coût, 8
    fournisseurs), base vectorielle par défaut (similarité cosinus),
    recherche plein texte/vectorielle/hybride/filtrée, assemblage et
    compression de contexte, intégration Context Engine ↔ Agent
    Commercial, tableaux de bord Knowledge/Memory Engine, isolation
    multi-tenant, performance de recherche ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] validé par une vraie requête HTTP contre le serveur (tableau de
    bord `/settings/knowledge` affiché sans erreur console derrière une
    session admin réelle), pas seulement des tests automatisés.
- **État fonctionnel de l'application** : Provence 360, le multi-tenant,
  le Framework des Agents, l'Agent Director, l'Agent Commercial et le
  Workflow Engine restent **entièrement fonctionnels** ; l'Agent
  Commercial bénéficie désormais d'un contexte automatiquement assemblé
  (documents indexés, préférences, décisions passées, historique) avant
  chaque email/relance/proposition généré, visible dans le tableau de bord
  `/settings/knowledge` (documents, embeddings, indexation, cache, coût
  IA, documents les plus utilisés, mémoire par niveau/nature).
- **Limite connue** : aucune extension `pgvector` disponible dans
  l'environnement — la base vectorielle par défaut reste fonctionnellement
  équivalente (Postgres natif + cosinus applicatif) mais pas à l'échelle
  d'un index approximatif (ADR 0025). PDF/Word/Excel/PowerPoint/Facture et
  Milvus/FAISS/LanceDB sont déclarés au registre mais échouent
  explicitement à l'exécution, faute de dépendance/modèle/protocole
  disponible (ADR 0027) ; Image/Audio/Vidéo n'ont que leur architecture
  préparée (énumération + point d'extension), sans extraction
  fonctionnelle, conformément au brief. "Qualité des réponses" est
  affichée comme indisponible faute de signal de retour utilisateur.
  Seul l'Agent Commercial appelle une IA générative aujourd'hui : c'est
  donc le seul agent dont l'intégration au Context Engine a pu être
  câblée et testée (ADR 0029) — Director/Workflow Engine en bénéficient de
  façon transitive sans appel direct à câbler.

## v0.7 bis — Calendrier (plan initial, reporté)

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

## v0.8 — Automation Engine Enterprise (remplace le plan initial)

> **Statut : ✅ livré** (2026-07-30). Comme pour `v0.2`/`v0.3`/`v0.4`/
> `v0.5`/`v0.6`/`v0.7`, ce jalon a été **redéfini sur demande explicite** :
> le contenu initialement prévu ici (infrastructure de jobs minimale au
> service des séquences/imports — `MOD-15`) est reporté à une version
> ultérieure sous une forme réduite (voir `v0.8 bis` ci-dessous) et
> remplacé par un module jugé plus prioritaire et transversal : un
> véritable moteur d'automatisation Enterprise, comparable aux meilleurs du
> marché (Temporal, n8n, Zapier, Make, GitHub Actions). Ce module **délivre
> entièrement** le périmètre technique de `MOD-15` (noyau de jobs durable
> Postgres, retry, dead-letter, tableau de bord) et va largement au-delà.
> Voir `ROADMAP.md` §1 octies et §MOD-27, ainsi que `docs/adr/0030` à
> `0037`.

- **Objectif du jalon** : Autorun ne se contente plus d'exécuter des
  workflows en mémoire (`MOD-25`, v0.6) — un second moteur, coexistant sans
  jamais le modifier, permet à n'importe quel agent/workflow/utilisateur/
  module de construire des automatisations complexes sans écrire de code,
  avec des garanties "enterprise" : chaque action s'exécute comme un job
  durable, individuellement retryable/verrouillable/priorisé/dead-
  letterable.
- **Modules** : MOD-27 (coexiste avec le Workflow Engine, `MOD-25`, v0.6 ;
  réutilise son Condition Engine sans le dupliquer ; délivre le périmètre
  technique de `MOD-15`).
- **Tâches** : voir `BACKLOG.md`, section v0.8 (schéma Prisma du noyau de
  jobs, Queue/Lock/Concurrency/Retry/Priority Manager, Circuit Breaker,
  Dead Letter Queue, Enterprise Scheduler, Trigger Engine + Event
  Dispatcher, câblage de points d'émission réels, Condition Engine réutilisé,
  Automation Registry, registre de jobs/actions, Job Executor, tableau de
  bord, API REST, UI + navigation, bootstrap + cron, tests, ADR).
- **Critères de sortie** :
  - [x] `tests/e2e/two-organizations-isolation.mjs` et le nouveau
    `tests/e2e/automation-golden-path.mjs` (création, activation,
    déclenchement manuel, avancée via le cron applicatif, run `SUCCEEDED`
    visible dans l'interface, tableau de bord et Dead Letter Queue
    affichés) passent sans erreur console, contre une instance réellement
    démarrée ;
  - [x] les 198 tests de v0.1 à v0.7 passent toujours sans modification de
    leur comportement ;
  - [x] 90 nouveaux tests (288 au total) passent contre une vraie base
    PostgreSQL : Queue Manager (dont un test de charge de concurrence,
    voir ADR 0032), Lock Manager, Concurrency Manager, Retry Engine +
    Circuit Breaker, Dead Letter Queue, Priority Manager, Scheduler,
    Trigger Engine (types + câblage réel des évènements/cron/webhook),
    Automation Registry, jobs/actions pluggables, Job Executor (graphe
    linéaire, branchement conditionnel, `loop`/`map`, `wait`, sous-
    automatisation, annulation, déclenchement/relance manuels), tableau de
    bord, permissions ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] validé par une vraie requête HTTP contre le serveur (une
    automatisation créée, activée et déclenchée via l'API atteint
    `SUCCEEDED` après passage par le cron applicatif, visible sans erreur
    console dans `/automations/runs/[runId]`, `/automations` et
    `/automations/dlq`), pas seulement des tests automatisés.
- **État fonctionnel de l'application** : Provence 360, le multi-tenant, le
  Framework des Agents, l'Agent Director, l'Agent Commercial, le Workflow
  Engine et l'intelligence documentaire restent **entièrement
  fonctionnels** ; un nouvel espace `/automations` (liste + tableau de bord,
  éditeur de version, détail de run, Dead Letter Queue) est accessible aux
  rôles `OWNER`/`ADMIN`/`MANAGER` (permission `MANAGE_AUTOMATIONS`, même
  distribution que `MANAGE_WORKFLOWS`) ; sept points d'émission réels de
  Provence 360 (leads CRUD, inscription/connexion, création d'organisation/
  workspace, import CSV) peuvent désormais déclencher une automatisation
  active abonnée à l'évènement correspondant.
- **Limite connue** : seul un sous-ensemble défensable des 26 types de
  déclencheurs déclarés est réellement câblé à un point d'émission de la
  plateforme (même honnêteté que le Workflow Engine v0.6, voir ADR 0037) —
  les autres (paiement reçu, document signé, client créé...) restent
  utilisables en manuel/API/webhook mais ne se déclenchent jamais tout
  seuls, faute de module métier correspondant (facturation, signature
  électronique) dans Provence 360 aujourd'hui. Le rate limiter du
  Concurrency Manager est en mémoire, par processus (limite assumée en
  déploiement multi-instance, voir ADR 0032). L'éditeur de graphe reste une
  édition JSON (pas de canevas visuel glisser-déposer comme le Workflow
  Engine, v0.6) — le brief v0.8 demandait avant tout le moteur et son
  observabilité, pas un second éditeur graphique.

## v0.8 bis — Infrastructure asynchrone minimale pour les traitements existants (plan initial, reporté)

- **Objectif du jalon** : sortir les traitements potentiellement longs
  (séquences, IA, imports, webhooks) du cycle requête/réponse HTTP.
  Devient, une fois entrepris, une MIGRATION vers le noyau de jobs déjà
  livré par `MOD-27` (v0.8) plutôt qu'une nouvelle infrastructure à
  construire — voir `ROADMAP.md` §1 octies.
- **Modules** : MOD-15 (périmètre technique déjà livré via `MOD-27`),
  migration de `MOD-04`/`MOD-05`/`MOD-06`/`MOD-12`/`MOD-14` vers ce noyau.
- **Tâches** : AR-0040 à AR-0046.
- **Critères de sortie** :
  - les séquences/imports/webhooks existants passent par
    `AutomationJob`/le Queue Manager Postgres au lieu d'un traitement
    synchrone ou d'un mécanisme ad hoc ;
  - le comportement des séquences est strictement identique à avant
    migration (non-régression du golden path) ;
  - le tableau de bord `/automations` (déjà livré) permet de consulter et
    relancer manuellement un job en échec issu de ces modules.
- **État fonctionnel de l'application** : identique du point de vue
  utilisateur final, mais l'application encaisse un import volumineux ou
  un pic d'envoi sans dégrader le temps de réponse HTTP.

## v0.9 — Provence 360 Operating System (remplace le plan initial)

> **Statut : ✅ livré** (2026-08-03). Comme pour `v0.2`–`v0.8`, ce jalon a
> été **redéfini sur demande explicite** : le contenu initialement prévu
> ici (observabilité transversale + connecteurs réels IA/email, voir
> `v0.9 bis` ci-dessous) est partiellement livré en tant qu'ingrédient de
> ce module plus large (connecteurs email réels), et reporté pour le
> reste (observabilité transversale dédiée, IA réellement configurable
> par organisation) — remplacé par un module jugé prioritaire par le
> mandat explicite du brief : transformer Autorun en système
> d'exploitation quotidien de Provence 360. Voir `ROADMAP.md` §1 novies et
> §MOD-28, ainsi que `docs/adr/0038` et `0039`.

- **Objectif du jalon** : « piloter quasiment toute mon entreprise depuis
  Autorun » — CRM étendu, devis/facturation réels, communication
  multicanal, email et agenda réels, visites 3D, tableaux de bord
  métier, 7 agents métier opérant sur les vraies données, automatisations
  prêtes à l'emploi, réglages complets.
- **Modules** : MOD-28 (étend additivement MOD-03/MOD-07/MOD-08/MOD-11 ;
  délivre une partie du périmètre technique de MOD-06 et MOD-14 ;
  réutilise les gabarits de MOD-25/MOD-27 et le patron architectural de
  MOD-24).
- **Tâches** : voir `BACKLOG.md`, section v0.9 (extensions du schéma CRM,
  chronologie, pipeline personnalisable, devis/factures réels,
  Communication Hub, connecteurs email réels, Google Calendar réel,
  Visites 3D, tableaux de bord, 7 agents métier, automatisations prêtes à
  l'emploi, réglages, ADR, validation finale).
- **Critères de sortie** :
  - [x] les 288 tests de v0.1 à v0.8 passent toujours sans modification de
    leur comportement ;
  - [x] 96 nouveaux tests (384 au total) passent contre une vraie base
    PostgreSQL : CRM étendu/chronologie, pipeline, devis/factures, Hub de
    communication (vrai serveur HTTP local), emails réels (vrais serveurs
    SMTP/HTTP locaux), Google Calendar (vrai serveur HTTP local), Visites
    3D, tableaux de bord, 7 agents métier (effets de bord réels vérifiés :
    `LeadScore`, `Message` en attente de validation, `Quote`/
    `QuoteVersion`, `Appointment`, `AuditLog`), automatisations métier
    (scénario complet déclencheur→job→agent→effet réel), réglages ;
  - [x] `npm run lint`, `npx tsc --noEmit` et `npm run build` passent sans
    erreur ;
  - [x] validé par de vraies requêtes HTTP contre un serveur de
    développement réellement démarré (connexion admin démo, page
    Paramètres rendue avec ses nouvelles sections, GET/PUT des routes de
    réglages email et organisation), pas seulement des tests automatisés.
- **État fonctionnel de l'application** : Provence 360, le multi-tenant,
  les moteurs Agents/Director/Commercial/Workflow/Automation/intelligence
  documentaire restent **entièrement fonctionnels** ; un nouvel espace
  `/dashboards` (6 tableaux de bord), `/invoices`, `/visits` sont
  accessibles ; 7 nouveaux agents métier installables ; 10 automatisations
  prêtes à l'emploi clonables depuis l'Automation Engine ; la page
  Paramètres expose entreprise/TVA/logo/email/agenda et un statut IA
  honnête.
- **Limite connue** : l'observabilité transversale dédiée (`MOD-16`) reste
  hors périmètre (au-delà des tableaux de bord métier déjà livrés par
  MOD-25/26/27/28) ; le fournisseur IA reste un réglage de déploiement
  (`LLM_PROVIDER`/`AI_PROVIDER`), pas configurable par organisation comme
  l'email (voir ADR 0039) ; SMS/WhatsApp/téléphone restent des stubs
  honnêtes (aucun fournisseur tiers disponible dans cet environnement) ;
  le paiement en ligne (Stripe réel, `MOD-12`) reste hors périmètre.

## v0.9 bis — Observabilité, quota IA dur, connecteurs Gmail/Outlook réels

> **Statut : ✅ livré** (2026-08-03). État des lieux réalisé avant
> exécution (relecture du code, pas seulement de la roadmap) : `AR-0047`
> (logs structurés) était déjà satisfaite depuis une phase antérieure —
> seul un test de non-régression manquait ; `AR-0052` (`SmtpEmailProvider`)
> était déjà livrée via `MOD-28` (v0.9). Le reste (`AR-0048` à `AR-0051`,
> `AR-0053`, `AR-0054`) est le travail réel de cette version. Voir
> `docs/adr/0040`.

- **Objectif du jalon** : donner de la visibilité opérationnelle réelle
  (logs déjà en place vérifiés, capture d'erreurs, métriques de base),
  un vrai fournisseur Anthropic pour la couche IA historique avec un
  quota mensuel dur partagé entre les deux couches IA de l'application,
  et deux connecteurs email supplémentaires (Gmail, Outlook) réels.
- **Modules** : MOD-16 (observabilité — capture d'erreurs et métriques ;
  les logs structurés existaient déjà), MOD-04 (IA réelle — fournisseur
  Anthropic + quota dur), MOD-06 (email réel — Gmail/Outlook, en plus de
  SMTP/Resend/Postmark/Brevo déjà livrés via `MOD-28`).
- **Tâches** : AR-0047 à AR-0054 (voir `BACKLOG.md` §Version 0.9 bis pour
  le détail complet de chacune, y compris les décisions d'architecture).
- **Critères de sortie** :
  - [x] logs structurés sans donnée sensible détectée par test automatisé
    (`tests/observability/logger.test.ts`) ;
  - [x] une exception simulée est capturée avec contexte suffisant pour
    être diagnostiquée, via l'API d'ingestion Sentry (`fetch()` direct,
    pas de SDK), vérifiée contre un vrai serveur HTTP local ;
  - [x] métriques de base (coût IA, taux d'échec email, latence API sur
    les routes instrumentées) exposées dans Paramètres → Métriques ;
  - [x] bascule `AI_PROVIDER=demo` → `AI_PROVIDER=anthropic` sans
    changement de code, avec quota mensuel dur par organisation
    (`Organization.aiMonthlyBudgetUsd`) vérifié par test — partagé entre
    la couche IA historique ET le Framework des Agents (les deux
    journalisent désormais un coût réel dans `AIRequest`) ;
  - [x] connecteurs email réels Gmail (API Gmail v1) et Outlook
    (Microsoft Graph) fonctionnels de bout en bout (OAuth2 + envoi),
    vérifiés contre de vrais serveurs HTTP locaux simulant les endpoints
    Google/Microsoft — la vérification contre un vrai compte n'a pas été
    possible dans cet environnement (aucun identifiant OAuth disponible) ;
  - [x] les 434 tests passent contre une vraie base PostgreSQL fraîchement
    migrée (384 de v0.9 + 50 nouveaux : logger, capture d'erreurs,
    métriques, fournisseur Anthropic IA, quota IA — y compris un run
    d'agent réel bloqué en bout en bout —, Gmail, Outlook) ;
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm run build` et les 3
    suites E2E (parcours principal, isolation multi-tenant,
    Automation Engine) passent sans erreur contre un serveur de
    production réellement démarré.
- **État fonctionnel de l'application** : Autorun tourne désormais avec
  une observabilité réelle (erreurs capturées, métriques visibles), un
  budget IA mensuel configurable et réellement bloquant, et le choix
  entre 6 fournisseurs email réels (SMTP/Resend/Postmark/Brevo/Gmail/
  Outlook) selon `EMAIL_PROVIDER`.
- **Explicitement hors périmètre (v1.0 ou au-delà)** : quota email dur
  (prévu `v0.10`, même standard que le quota IA) ; middleware de latence
  API global sur toutes les routes (extension incrémentale actuelle,
  route par route) ; vérification de bout en bout contre de vrais
  comptes Anthropic/Gmail/Microsoft 365 (aucun identifiant disponible
  dans cet environnement) ; fusion des deux abstractions IA
  (`src/lib/ai/` et `src/lib/agents/llm/`) — restent volontairement
  distinctes (voir ADR 0040).

## v0.10 — Sécurité avancée (porte obligatoire avant v1.0)

> **Statut : ✅ livré** (2026-08-03). Ce jalon est un **gate**, pas une
> fonctionnalité — condition bloquante avant toute ouverture SaaS
> publique. Précédé d'un audit exhaustif du code (3 revues indépendantes :
> sécurité/isolation, dette technique/performance, tests/migrations/
> observabilité/documentation/CI, plus une vérification manuelle du
> parcours de réinitialisation de mot de passe), qui a révélé une faille
> critique (`AR-0153`) non anticipée par le plan initial de `MOD-17`. Voir
> `docs/adr/0041` et `docs/security/owasp-review-2026-08-03.md`.

- **Objectif du jalon** : durcir l'isolation multi-tenant et la sécurité
  générale avant toute ouverture SaaS publique (`MOD-19`).
- **Modules** : MOD-17.
- **Tâches** : AR-0055 à AR-0058 (concrétisées après audit), AR-0153 à
  AR-0159 (nouvelles, issues de l'audit) — voir `BACKLOG.md` §Version 0.10
  pour le détail complet de chacune.
- **Critères de sortie** :
  - [x] correction de la faille critique du lien de réinitialisation de
    mot de passe (`AR-0153`) ;
  - [x] masquage des secrets dans les réponses API du Communication Hub
    (`AR-0154`) ;
  - [x] verrouillage de compte et limitation de débit sur l'authentification
    (`AR-0155`) ;
  - [x] secret de webhook obligatoire, Workflow Engine et Automation
    Engine (`AR-0156`) ;
  - [x] quota email dur vérifié par test, généralisé à tous les points
    d'envoi réel — y compris Workflow Engine et Automation Engine, qui
    l'ignoraient totalement (`AR-0057`) ;
  - [x] schéma et interface 2FA (TOTP) en place, non forcés, prêts pour
    activation (`AR-0058`) ;
  - [x] suite de tests d'isolation multi-tenant étendue aux domaines
    financiers et porteurs de secrets — factures, devis, rendez-vous,
    automatisations, Communication Hub, email, calendrier (`AR-0055`) ;
  - [x] tests ajoutés pour 3 modules critiques jusque-là sans aucun test
    (moteur de séquences, liste de suppression RGPD, jetons de
    désinscription — `AR-0158`) ;
  - [x] les 3 suites E2E exécutées sur chaque pull request, plus
    seulement après merge (`AR-0157`) ;
  - [x] rapport de revue OWASP Top 10 consolidé, sans vulnérabilité
    critique ouverte non corrigée (`AR-0056`) ;
  - [x] `README.md` à jour avec le périmètre fonctionnel réel (`AR-0159`) ;
  - [x] les 522 tests passent contre une vraie base PostgreSQL
    fraîchement migrée (434 en fin de v0.9 bis + 88 nouveaux au fil de la
    v0.10 — dont le vecteur de test officiel RFC 4226 pour le TOTP, le
    quota email de bout en bout, et 7 nouveaux domaines d'isolation
    multi-tenant) ;
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm run build` et les 3
    suites E2E (parcours principal, isolation multi-tenant, Automation
    Engine) passent sans erreur contre un serveur de production
    réellement démarré, sur une base fraîchement migrée et seedée.
- **État fonctionnel de l'application** : inchangé fonctionnellement pour
  l'utilisateur (aucune régression) ; changement de posture de sécurité
  mesurable et documenté — la faille de réinitialisation de mot de passe
  aurait été un incident de sécurité majeur en production si elle n'avait
  pas été détectée avant `v1.0`.
- **Explicitement hors périmètre (post-v1.0)** : activation effective du
  2FA à la connexion (schéma/interface prêts, non imposés) ; revue de
  sécurité externe indépendante (recommandée avant ouverture SaaS
  publique, voir le rapport OWASP) ; les constats P1/P2 de l'audit
  (N+1, index manquants, duplications mineures, alerting sur seuil, cache
  Redis...) — détaillés et justifiés dans
  `docs/security/owasp-review-2026-08-03.md` plutôt que transformés en
  tâches.

## v1.0 — Ouverture SaaS (première version stable)

> **Statut : ✅ livré** (2026-08-03). `AR-0059` à `AR-0066` implémentées
> intégralement, sans modification du périmètre défini. Les 4 suites E2E
> (golden path, isolation multi-tenant, Automation Engine, onboarding
> self-service) passent contre un build de production réel ; 602 tests
> automatisés passent ; typecheck/lint/build sans erreur. Voir
> `docs/adr/0042` et `docs/release/v1.0-recette.md` pour le détail complet
> et l'évaluation finale de préparation à la production.

- **Objectif du jalon** : permettre à une nouvelle organisation de
  s'inscrire, choisir un plan, payer, et être opérationnelle sans
  intervention manuelle — condition de "SaaS" au sens propre du terme.
- **Modules** : MOD-18, MOD-19.
- **Tâches** : AR-0059 à AR-0066.
- **Critères de sortie** :
  - [x] API publique en lecture fonctionnelle, isolée par organisation,
    avec rate limiting actif ;
  - [x] au moins un webhook sortant livré avec succès à un récepteur de
    test, avec retry prouvé sur échec simulé ;
  - [x] un changement de plan applique immédiatement les nouveaux quotas ;
  - [x] un échec de paiement d'abonnement bascule l'organisation en statut
    restreint sans perte de données ;
  - [x] le parcours d'inscription self-service complet (compte →
    organisation → plan → provisionnement) fonctionne de bout en bout
    sans intervention manuelle ;
  - [x] recette finale (AR-0066) passée — voir
    `docs/release/v1.0-recette.md`.
- **État fonctionnel de l'application** : **première version stable
  d'Autorun** — plateforme SaaS multi-vertical, multi-tenant, avec
  facturation d'abonnement, prospection à client à facturation, sécurité
  auditée, observabilité en place. C'est le jalon qui clôt la roadmap
  initiale ; les évolutions suivantes (§"Fonctionnalités pouvant être
  ajoutées plus tard" de `ROADMAP.md`) relèvent d'un nouveau cycle de
  planification.

---

## v1.1 — Provence 360 Production (nouveau cycle de planification)

> **Statut : ✅ livrée** (démarrée et livrée le 2026-08-04). `v1.0` a clos la
> roadmap initiale ; `v1.1` ouvre un nouveau cycle défini directement par
> le fondateur de Provence 360, pas par le plan `MOD-00`→`MOD-19`
> d'origine : Autorun cesse d'être développé comme un SaaS générique pour
> devenir le logiciel métier quotidien réel de sa propre entreprise. Voir
> `BACKLOG.md` §Version 1.1 et `docs/adr/0043`/`docs/adr/0044`.

- **Objectif du jalon** : qu'un prospect puisse parcourir tout son cycle
  de vie — prospection, qualification, premier contact, rendez-vous,
  visite virtuelle, devis, signature, facturation, paiement, suivi,
  fidélisation — sans quitter Autorun.
- **Modules** : MOD-29.
- **Tâches** : AR-0160 à AR-0185 (26 tâches).
- **Critères de sortie** :
  - [x] chaque fiche prospect/client (CRM production) affiche réellement
    timeline, documents, notes, historique, automatisations, agents IA,
    visites, devis, factures, paiements, GPS/Google Maps, statistiques,
    tags, pipeline, relations entre fiches ;
  - [x] le pipeline commercial reflète le vocabulaire Provence 360 et
    chaque transition d'étape peut déclencher une automatisation
    granulaire ;
  - [x] le module Visites 3D couvre le cycle complet jusqu'à la livraison
    client et la facturation directe ;
  - [x] les devis/factures ont un historique de versions consultable et
    un suivi de paiement au-delà du binaire payé/non payé ;
  - [x] SMS, WhatsApp et téléphone ont un fournisseur réel (plus
    seulement démo) ;
  - [x] les 8 agents IA de la cible du brief existent, dont Qualification
    et Visites (nouveaux) ;
  - [x] les 10 automatisations prêtes à l'emploi couvrent les 10
    déclencheurs cibles, y compris la livraison ;
  - [x] les tableaux de bord Planning et Financier existent ;
  - [x] recherche globale, palette de commandes, glisser-déposer sur le
    pipeline, mode sombre et raccourcis clavier sont fonctionnels ;
  - [x] recette finale (`docs/release/v1.1-recette.md`) passée.
- **État fonctionnel visé** : Autorun devient réellement utilisable au
  quotidien pour piloter l'intégralité de l'activité de Provence 360,
  sans recours à un autre logiciel lorsque cela est évitable.

---

## v1.6 — Première version réellement testable sans écrire de code

> **Statut : ✅ livrée.** Mission donnée directement par le fondateur de
> Provence 360 : la priorité cesse d'être le nombre de fonctionnalités
> développées pour devenir leur utilisabilité réelle depuis l'interface —
> voir `docs/adr/0049`.

- **Objectif du jalon** : pouvoir installer et utiliser Autorun sans
  ouvrir un terminal après l'installation initiale — créer un compte, une
  organisation, inviter un utilisateur, connecter Gmail/Google
  Calendar/Slack/Discord, créer et exécuter un workflow, créer un agent IA
  et discuter avec lui, consulter logs/coûts IA/statistiques, le tout
  depuis l'interface.
- **Tâches** : v1.6-1 à v1.6-13 (voir la liste de tâches de session).
- **Critères de sortie** :
  - [x] agents IA personnalisés créés/pilotés entièrement depuis
    l'interface (`/agents`) : choix du fournisseur LLM, des outils, de la
    mémoire, chat immédiat, historique complet ;
  - [x] écran **Connecteurs** unique (`/connectors`) pour
    Gmail/Google Calendar/Slack/Discord/Stripe ;
  - [x] tableau de bord unifié agrégeant workflows, automatisations,
    agents, mémoire, connecteurs, coûts IA, erreurs et notifications ;
  - [x] observabilité temps réel (métriques actualisées automatiquement,
    erreurs API récentes) sans quitter l'écran ;
  - [x] `npm run quickstart` : une seule commande pour migrer, seeder (si
    base vide) et démarrer le serveur de développement ;
  - [x] bouton **Découvrir Autorun** : provisionnement démo complet en un
    clic, vérifié idempotent et isolé par organisation ;
  - [x] guides pas à pas (`docs/guides/INSTALLATION.md`,
    `docs/guides/USER_GUIDE.md`, `docs/guides/FAQ.md`) permettant une
    installation et une prise en main en moins de 10 minutes ;
  - [x] suite de tests complète (962 tests) toujours verte, aucune
    régression.
- **État fonctionnel visé** : un utilisateur non technique peut installer,
  découvrir et utiliser l'essentiel d'Autorun sans jamais écrire de code.

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
| v0.7 | Infrastructure (intelligence documentaire transversale) | Oui (tableau de bord Intelligence documentaire) | Oui (tout agent générant du texte, actuellement l'Agent Commercial) |
| v0.7 bis | Fonctionnalité (reportée) | Oui | Non |
| v0.8 | Infrastructure (moteur d'automatisation transversal) | Oui (éditeur + tableau de bord Automations) | Oui (fondation du noyau de jobs pour toute automatisation future) |
| v0.8 bis | Infrastructure (migration, reportée) | Non (transparent) | Recommandé avant v0.9 (IA/email réels à fort volume) |
| v0.9 | Fonctionnalité (système d'exploitation Provence 360) | Oui (CRM étendu, devis/factures, visites 3D, tableaux de bord, 7 agents métier, automatisations, réglages) | Non (chaque extension reste additive) |
| v0.9 bis | Fonctionnalité + ops (observabilité, quota IA dur, Gmail/Outlook réels) | Oui (métriques, quota IA, email Gmail/Outlook) | Non |
| v0.10 | Sécurité | Non | **Oui, bloquant pour v1.0** |
| v1.0 | Ouverture SaaS | Oui | — (fin de cycle initial) |
| v1.1 | Provence 360 Production (nouveau cycle) | Oui | Non (extension continue) |

---

*Voir `BACKLOG.md` pour le détail des tâches de chaque jalon et
`DEVELOPMENT_GUIDE.md` pour la façon de les exécuter au quotidien.*
