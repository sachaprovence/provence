# ADR 0046 — v1.3 : Production Integrations & First Customer Readiness

- **Statut** : Acceptée
- **Date** : 2026-08-04
- **Portée** : décisions d'implémentation transverses à AR-0172–AR-0177 (branche `claude/autorun-v1.3-production-readiness`, base : `main` après fusion de la PR #10 / v1.2).

## Contexte

v1.3 vise à faire passer Autorun de « prêt pour la préproduction » (v1.2) à
« prêt pour un premier client réel ». Deux décisions bloquantes ont été
posées à l'opérateur avant de démarrer (voir historique de session) :

1. **Base de la branche v1.3** : la PR #10 (v1.2) était encore ouverte sur
   `main` au moment de la demande v1.3, alors que v1.3 s'appuie explicitement
   sur les livrables v1.2 (diagnostics d'intégration AR-0165, sauvegarde/
   restauration AR-0166, etc.). Réponse retenue : **fusionner la PR #10
   d'abord, puis créer `claude/autorun-v1.3-production-readiness` depuis
   `main`** — évite de développer v1.3 contre une base qui ne contiendrait
   pas les fondations dont elle dépend, et évite toute ambiguïté sur ce que
   « compatibilité ascendante » et « tests existants au vert » signifient.
2. **AR-0172 (validation contre des comptes réels)** : aucun identifiant
   Stripe/Gmail/Outlook/Twilio de test, ni bucket S3 réel, n'existe dans cet
   environnement. Un jeu de clés AWS était présent dans l'environnement
   shell ambiant, mais rien n'indiquait qu'il était destiné à ce test S3 —
   utiliser des identifiants trouvés sans confirmation explicite de
   l'opérateur aurait outrepassé le périmètre de la tâche. Réponse retenue :
   **ne pas valider contre de vrais comptes ; construire uniquement l'outillage
   de preuve**, qui rapporte honnêtement l'état réel (`NOT_CONFIGURED` tant
   qu'aucun identifiant n'est fourni) plutôt que de simuler un succès.

## Décision — AR-0172 : outillage de preuve de validation des intégrations

- **Réutilisation directe des fournisseurs de diagnostic AR-0165**
  (`src/lib/diagnostics/providers/{stripe,twilio,gmail,outlook,s3}-diagnostic.ts`)
  plutôt que d'écrire une seconde logique de vérification : ce sont déjà les
  seules implémentations bas-privilège, en lecture seule, testées, qui
  encapsulent la connaissance de « comment vérifier chaque intégration sans
  effet de bord ».
- **Contournement volontaire de `integration-diagnostics-service.ts`** : cet
  orchestrateur applique une limitation de débit (5 tests / intégration /
  organisation / 5 min) et persiste chaque résultat dans
  `IntegrationDiagnosticCheck`, conçu pour une action ponctuelle déclenchée
  par un utilisateur humain depuis l'écran de diagnostic. Un outil d'audit/
  recette qui s'exécute pour produire une preuve documentaire n'est pas cet
  acteur : l'exécuter au travers de l'orchestrateur pollueriez la table
  d'audit avec des exécutions n'ayant aucun utilisateur réel associé, et
  risquerait de consommer le quota de débit destiné aux vrais opérateurs.
  Le script (`scripts/validate-integrations.ts`) appelle donc directement
  chaque fournisseur.
- **Séparation script CLI / logique testable** (convention déjà établie en
  v1.2, ex. `scripts/backup-database.ts` + `scripts/lib/db-backup.ts`) :
  la logique sans effet de bord (`evaluateProvider`, `renderMarkdown`,
  `ProviderEvidence`) vit dans `scripts/lib/integration-validation.ts`, sans
  aucun `main()` invoqué au chargement du module — donc importable en toute
  sécurité depuis les tests. Le point d'entrée CLI
  (`scripts/validate-integrations.ts`) ne fait qu'orchestrer l'exécution,
  l'écriture des fichiers de sortie, et `process.exit` en cas d'erreur.
- **Aucune preuve fabriquée** : `ProviderEvidence.realAccountValidated` est
  typé littéralement `false` (jamais `boolean`) — impossible de le faire
  passer à `true` par erreur tant qu'un opérateur humain n'a pas fourni de
  vrais identifiants et modifié le script en conséquence. Le rapport
  Markdown généré (`docs/release/integration-validation-evidence-v1.3.md`)
  affiche un bandeau d'avertissement explicite si aucune intégration n'est
  validée contre un compte réel — jamais un tableau silencieusement vert.
- **Sortie double** : Markdown (lecture humaine, recette) + JSON
  (`docs/release/integration-validation-evidence-v1.3.json`, exploitable par
  un futur pipeline d'audit automatisé).
- **`npm run integrations:validate`** ajouté, avec le même hook
  `NODE_OPTIONS=--require=./prisma/seed-server-only-cjs-hook.cjs` déjà utilisé
  par `db:seed` et `test:migrations:fresh` : les fournisseurs de diagnostic
  importent des modules marqués `import "server-only"` (protection Next.js
  Server Component), incompatible avec l'exécution CommonJS de `tsx` en
  dehors du framework Next.js sans ce patch de résolution de module.

## Conséquences

- Prembattre l'exécution réelle du script contre l'environnement de
  développement (aucun identifiant configuré) produit honnêtement 5×
  `NOT_CONFIGURED` — attendu, et documenté comme tel dans le rapport final
  v1.3 : **AR-0172 reste une action opérateur non complétée**, pas une case
  cochée par erreur.
- Quand l'opérateur fournira de vrais identifiants de test (Stripe test
  mode, comptes Google/Microsoft de test, bucket S3 réel, compte Twilio de
  test), il suffit de réexécuter `npm run integrations:validate` : aucune
  modification de code n'est nécessaire, les fournisseurs AR-0165
  détecteront automatiquement `CONFIGURED` et déclencheront le test réel.

## Décision — AR-0173 : propagation complète de `X-Request-Id` + finalisation de la CSP

### `X-Request-Id` sur tous les sites d'appel

`toApiErrorResponse(error, context)` devient `toApiErrorResponse(error,
request, context)` — `requestId` en est dérivé automatiquement
(`getRequestId(request)`) et ajouté au contexte journalisé, toujours APRÈS
le contexte fourni par l'appelant (`{ err, statusCode, ...context,
requestId }`) pour qu'il ne puisse **jamais** être écrasé, même par erreur.
v1.2 n'avait câblé qu'une seule route de démonstration
(`billing/webhook`) ; v1.3 retrofit les ~160 sites d'appel restants de
`src/app/api/**/route.ts` via un codemod AST
(`scripts/codemods/add-request-to-api-error-responses.ts`, conservé dans le
dépôt) plutôt que des éditions manuelles — trop nombreuses et répétitives
pour être fiables à la main. `src/lib/public-api/handler.ts` (point d'entrée
commun de toute l'API publique v1) n'a nécessité qu'une modification, pas
160 : les routes `api/public/v1/**` passent toutes par ce wrapper.

### CSP stricte à base de nonce (v1.2 l'avait différée, voir ADR 0045)

v1.2 avait explicitement reporté la CSP, faute de vérification page par
page qu'aucun script externe ou `unsafe-inline` n'était nécessaire. Cette
vérification a été faite en v1.3 : aucune iframe, aucun `<Script>` externe,
aucun WebSocket côté client, un seul `dangerouslySetInnerHTML` dans tout le
dépôt (`src/app/layout.tsx`, script bloquant d'init du thème). Toutes les
URLs `https://` référencées dans `src/` sont des appels serveur-à-serveur
vers des fournisseurs tiers (Stripe, Gmail, Outlook, Twilio...), jamais des
ressources chargées par le navigateur — donc hors périmètre de la CSP.

- **Générée par requête dans `src/proxy.ts`** (`src/lib/security/csp.ts#buildCspHeader`),
  jamais dans `next.config.ts#headers()` : un nonce doit être unique par
  requête, or `next.config.ts` ne peut renvoyer qu'une chaîne statique
  connue une seule fois au build.
- **`script-src 'self' 'nonce-X' 'strict-dynamic'`** (+ `'unsafe-eval'` en
  développement uniquement, requis par React pour la reconstruction des
  piles d'erreur serveur→navigateur) — jamais `'unsafe-inline'`, ni en
  développement ni en production. C'est la directive à plus fort impact
  sécurité (XSS) ; elle reste strictement nonce-only.
- **`style-src 'self' 'unsafe-inline'`** (sans nonce), dans les deux
  environnements — corrigé pendant la validation finale v1.3 : la suite E2E
  `two-organizations-isolation.mjs` a révélé des violations CSP réelles sur
  `/dashboard`, provenant de composants avec des styles inline à valeur
  **dynamique** (`tag-manager.tsx`, `leads-kanban-board.tsx`,
  `director-plan-graph.tsx` — couleurs issues de la base, jamais des
  constantes). Un nonce/hash sur `style-src` ne peut PAS couvrir un
  attribut `style="..."` (seul `'unsafe-hashes'` le permettrait, et
  seulement pour un ensemble fixe de valeurs connues au build — inapplicable
  à une couleur qui varie avec les données). L'affirmation initiale de cette
  ADR ("aucun script/style externe... vérifié page par page") était donc
  incomplète : la vérification n'avait couvert que le golden path, pas le
  test d'isolation multi-tenant. Compromis assumé et courant en production :
  `script-src` strict (protection XSS, l'enjeu principal), `style-src`
  permissif (l'injection CSS a un impact bien moindre qu'une injection JS).
- Le nonce est transmis au gestionnaire de route/page via l'en-tête
  `x-nonce` (même mécanisme que `X-Request-Id`) ; `src/app/layout.tsx` le
  lit via `headers()` (Server Component) et l'applique au script inline du
  thème.
- **Conséquence assumée** : lire `headers()` dans le layout racine force le
  rendu dynamique de TOUTE page (documentation Next.js sur les nonces CSP)
  — y compris les 3 pages encore statiques (`/login`, `/register`,
  `/reset-password`), le reste de l'application étant déjà entièrement
  dynamique (session, données par organisation). Coût de performance jugé
  négligible face au bénéfice de sécurité, et vérifié par les 4 suites E2E
  (dont 3 démarrant d'une organisation fraîche) : zéro erreur console,
  zéro violation CSP, sur l'ensemble du parcours (connexion, inscription,
  facturation, automatisations, workflows).

### Capture des erreurs hors gestionnaire applicatif (`onRequestError`)

`toApiErrorResponse` ne voit jamais une erreur levée pendant le rendu d'un
Server Component, une Server Action, ou par le Proxy lui-même (en dehors de
tout `try/catch` applicatif) — jusqu'ici seulement visible dans la sortie
console brute de Next.js, jamais dans le journal structuré ni Sentry.
`src/instrumentation.ts` exporte désormais `onRequestError` (seul point
d'entrée officiel Next.js pour ce cas), qui journalise avec le contexte
route/routeur/type et déclenche `captureExceptionBestEffort` — mêmes
garanties que `toApiErrorResponse`.

### Arrêt propre sous charge — vérifié empiriquement, pas seulement affirmé

Un premier test naïf (60 requêtes concurrentes envoyées d'un coup, 5ms
avant `SIGTERM`) a montré ~16/60 échecs `ECONNRESET`. Analyse : ce n'est
PAS un défaut de `next start` (lecture de `node_modules/next/dist/server/
lib/start-server.js` : `server.close()` standard, ne coupe QUE les
nouvelles connexions, jamais `closeAllConnections()` hors mode dev) — c'est
un artefact du test lui-même, qui saturait la file d'attente TCP du
système au point que des connexions jamais encore acceptées par le
processus échouaient pour une raison indépendante du comportement d'arrêt
propre de l'application.

Réécrit avec une charge réaliste (8 requêtes, 50ms de battement avant
`SIGTERM` pour laisser les connexions être réellement acceptées) :
`scripts/verify-graceful-shutdown.mjs` — exécuté pour de vrai contre un
`next start` en mode production (jamais `next dev`) — confirme :
- 8/8 requêtes réellement en cours de traitement au moment du signal se
  terminent avec succès (aucune interruption).
- Le processus quitte de lui-même en ~3s, largement sous le délai de grâce
  de 30s (`docker-compose.yml#stop_grace_period`, ajouté dans cette passe —
  absent auparavant, valeur par défaut Docker de 10s jugée trop proche de
  la borne basse recommandée par Next.js pour une requête lente, ex.
  génération de PDF).

### Readiness pendant un déploiement — bascule immédiate, pas seulement à la fin du drain

Sans intervention, un rolling update continuerait de router du NOUVEAU
trafic vers une instance déjà en train de s'arrêter jusqu'à ce que la sonde
de disponibilité échoue par un autre moyen (ex. connexion refusée) —
plus tardif et moins fiable qu'un signal explicite. `src/lib/health/
shutdown-state.ts` (simple booléen en mémoire) est posé à `true` par un
écouteur `SIGTERM`/`SIGINT` enregistré dans `src/instrumentation.ts`
(JAMAIS `process.exit()` ici — le nettoyage et la sortie du processus
restent entièrement gérés par Next.js) ; `evaluateReadiness()`
(`/api/health/ready`) le vérifie EN PREMIER, avant même d'interroger la
base de données, et bascule sur `503` dès que l'arrêt commence. Vérifié
empiriquement dans le même script : readiness bascule 14ms après
`SIGTERM` — bien avant que le processus n'ait fini de drainer quoi que ce
soit. `/api/health/live` (liveness) reste volontairement inchangée
pendant ce temps : le processus est toujours vivant et termine son
travail, seule sa disponibilité pour du NOUVEAU trafic doit être signalée.

## Conséquences (AR-0173)

- Toute nouvelle route API DOIT désormais passer `request` à
  `toApiErrorResponse` — une erreur TypeScript (paramètre manquant) le
  rappelle immédiatement à la revue de code plutôt qu'un oubli silencieux.
- Toute nouvelle iframe ou script externe non nonced fera échouer
  silencieusement la ressource correspondante (bloquée par le navigateur) —
  à surveiller via les futurs rapports d'erreurs `report-to`/`report-uri`
  (non câblés dans cette passe, identifié comme travail futur pour
  AR-0174/monitoring). `style-src` reste volontairement permissif (voir
  ci-dessus), donc un nouveau style inline ne fera jamais échouer de
  ressource.
- Un orchestrateur de déploiement (Kubernetes, load balancer) DOIT
  interroger `/api/health/ready` (jamais `/api/health/live`) pour décider
  de router du trafic — c'était déjà vrai depuis AR-0167 (v1.2), mais
  prend maintenant tout son sens : c'est cette route précise qui porte le
  signal précoce d'arrêt en cours.
- `scripts/verify-graceful-shutdown.mjs` doit être réexécuté après toute
  modification de `src/instrumentation.ts`, `src/lib/health/*`, ou du
  `CMD`/`ENTRYPOINT` du `Dockerfile` — une preuve empirique rejouable,
  jamais seulement une affirmation.

## Décision — AR-0174 : monitoring (réponse, file d'attente, workers, sauvegarde, erreurs)

### Deux audiences distinctes, jamais mélangées

Ce dépôt n'a — et n'introduit délibérément PAS ici — de rôle « administrateur
plateforme » distinct d'un administrateur d'organisation cliente (toute
l'authentification est scopée par organisation, voir `isAdmin(actor)`).
Or les six métriques demandées relèvent de deux audiences réellement
différentes :

1. **Métriques par organisation** (réponse, file d'attente/workers, taux
   d'erreur) — un administrateur client légitimement intéressé par LA
   SANTÉ DE SES PROPRES automatisations/API. Étendent la page existante
   `/settings/metrics` (v0.9 bis, AR-0049), déjà gardée par `isAdmin`.
2. **Métriques de sauvegarde** — un réglage de DÉPLOIEMENT (une seule base
   de données par instance, potentiellement partagée par plusieurs
   organisations depuis v1.0). Les exposer via le même endpoint web
   qu'un client peut atteindre serait une fuite d'information inter-tenant
   (statut/horodatage/taille des sauvegardes de la plateforme entière).
   Choix : **CLI uniquement** (`scripts/backup-metrics-report.ts`, accès
   réservé à qui a un accès déploiement/base de données), jamais un
   endpoint web — inventer un rôle « superadmin plateforme » pour ce seul
   besoin aurait été un ajout d'architecture d'authentification hors
   périmètre de cette passe.

### Réponse/erreurs — extension, pas duplication

`getApiLatencyMetrics` (existant) gagne un champ dérivé `errorRate`
(`errorCount / requestCount`, `null` sans requête mesurée) — aucune
nouvelle collecte, juste un calcul supplémentaire sur des données déjà
journalisées.

### File d'attente/workers — réutilise `AutomationJob` (v0.8), agrégé par organisation

`getQueueWorkerMetrics(organizationId)` reprend exactement la logique de
`automation/dashboard-service.ts#getAutomationDashboard` (comptage par
statut, profondeur de file, heuristique de worker actif — un job réclamé
dans la dernière minute, aucun registre de workers vivants n'existe, voir
ADR 0036) mais agrégée par ORGANISATION plutôt que par workspace, pour
rejoindre les autres métriques de `/settings/metrics`, elles aussi par
organisation (une organisation peut avoir plusieurs workspaces).

### Sauvegarde — nouveau modèle `BackupRun`, jusqu'ici seulement un fichier local

`scripts/backup-database.ts`/`verify-database-backup.ts`/
`backup-s3-objects.ts`/`verify-s3-backup.ts` ne consignaient leur résultat
que dans un fichier `.meta.json`/`manifest.json` local au répertoire de
sauvegarde — perdu si ce répertoire n'est pas conservé entre exécutions ou
instances (typiquement le cas : la sauvegarde tourne depuis un cron
externe, pas forcément sur le même volume que l'application). Nouveau
modèle `BackupRun` (migration additive) + `recordBackupRun()` (best-effort,
jamais bloquant — même discipline que `recordApiMetric`) appelé par les 4
scripts, succès ET échec. Vérifié pour de vrai : `npm run backup:db` puis
`npx tsx scripts/verify-database-backup.ts <fichier>` puis
`npm run backup:metrics-report` — les deux exécutions réelles apparaissent
avec leur durée/succès, les types S3 (non exécutés dans cet environnement,
aucun bucket réel disponible) sont honnêtement signalés comme sans
exécution récente plutôt que silencieusement omis.

`src/lib/observability/backup-metrics.ts` est délibérément SANS
`import "server-only"` (contrairement à `api-metrics.ts`) : ses seuls
consommateurs sont des scripts CLI exécutés hors du serveur Next.js — `@/lib/
prisma` lui-même n'a pas ce garde-fou, ce qui rend l'import direct possible
depuis `tsx` sans le patch `NODE_OPTIONS=--require=...` utilisé ailleurs
(AR-0172) pour des modules qui, eux, importent réellement `"server-only"`
en aval.

## Décision — AR-0175 : reprise après sinistre (automatisation, rétention, RTO/RPO)

v1.2 (AR-0166) avait déjà livré l'exigence la plus critique — jamais
déclarer une sauvegarde valide sans une restauration réelle prouvée — mais
seulement comme deux commandes manuelles, sans planification automatisée
ni politique de purge. v1.3 complète les deux pièces manquantes plutôt que
de refaire ce qui existe déjà :

- **`scripts/run-scheduled-backup.ts`** (`npm run backup:scheduled`) —
  chaîne sauvegarde + vérification par restauration réelle en une seule
  commande (code de sortie non nul si l'une ou l'autre échoue), conçue
  pour être LA seule ligne à programmer en cron/systemd timer. Réutilise
  `backupDatabase()` directement mais relance `verify-database-backup.ts`
  en sous-processus plutôt que dupliquer sa logique de restauration
  (~80 lignes) — un seul endroit sait restaurer/vérifier une sauvegarde.
  **Vérifié pour de vrai** contre la base de développement : les deux
  étapes réussissent, `BackupRun` (AR-0174) enregistre les deux exécutions.
- **`scripts/lib/backup-retention.ts` + `scripts/prune-old-backups.ts`**
  (`npm run backup:prune`) — politique de purge absente jusqu'ici (les
  fichiers `.dump` s'accumulaient indéfiniment). Trois garde-fous
  non-contournables, dans cet ordre : (1) jamais une sauvegarde non
  vérifiée par restauration réelle, (2) jamais les 3 sauvegardes vérifiées
  les plus récentes quel que soit leur âge, (3) au-delà, purge celles plus
  anciennes que la fenêtre de rétention. **Dry-run par défaut** —
  `--apply` requis explicitement pour supprimer réellement (jamais le
  comportement par défaut d'un script exécutable sans supervision directe
  en CI/cron). Logique extraite dans `scripts/lib/` (sans `main()`, même
  convention qu'ailleurs) pour rester testable unitairement sans toucher
  au système de fichiers réel.
- **RTO/RPO explicites** (`docs/operations/BACKUP_RESTORE.md` §9) : RPO de
  24h avec une planification quotidienne — un engagement chiffré plutôt
  qu'une vague promesse de "sauvegardes régulières". RTO explicitement
  documenté comme mesuré sur l'environnement de développement (quelques
  secondes) et À RE-MESURER sur un volume de données représentatif avant
  tout engagement contractuel — jamais affirmé sans réserve pour un volume
  de production non encore observé.

### Conséquences (AR-0175)

- La planification (cron/systemd) reste une étape MANUELLE de mise en
  service (documentée, pas automatiquement câblée par ce dépôt lui-même)
  — cohérent avec le principe déjà établi qu'aucune restauration/purge
  destructive ne doit être déclenchable sans une action explicite d'un
  opérateur ayant accès à l'infrastructure de déploiement.
- `npm run backup:metrics-report` (AR-0174) devient l'outil de vérification
  que la planification fonctionne réellement dans la durée — documenté
  comme tel, pas seulement comme un rapport ponctuel.

## Décision — AR-0176 : sécurité (revue ciblée, pas une reprise de l'audit v0.10)

Détail complet dans `docs/security/security-review-v1.3-2026-08-04.md`
(nouveau document, même convention que `npm-audit-v1.2-2026-08-04.md` — un
audit versionné distinct plutôt qu'une réécriture de l'audit v0.10). Deux
constats P1 documentés comme ouverts depuis la revue OWASP v0.10 ont été
fermés : absence de scan de secrets automatisé en CI
(`scripts/scan-secrets.ts` + `scripts/lib/secret-scan.ts`, câblé dans
`.github/workflows/ci.yml`) et comparaison non constante pour
`CRON_SECRET` (`isValidCronRequest()`, `timingSafeStringEqual`, les 7
routes `/api/cron/*` migrées). Complété par : `npm audit` (0
vulnérabilité), revue des en-têtes HTTP, audit des permissions confirmant
qu'aucune régression d'isolation multi-tenant n'a été introduite par le
retrofit `X-Request-Id` à ~160 sites d'appel (AR-0173), revue de la
limitation de débit (mécanismes existants confirmés intacts).

## Décision — AR-0177 : documentation de production

Cinq documents ajoutés dans `docs/operations/`, chacun renvoyant vers les
autres plutôt que de dupliquer leur contenu (même principe que les
documents v1.2 existants) :
- `DEPLOYMENT_CHECKLIST.md` — version "à cocher" de `DEPLOYMENT.md`.
- `INCIDENT_RESPONSE.md` — niveaux de sévérité + scénarios courants,
  chacun renvoyant vers l'outil/le document existant pertinent (readiness,
  `/settings/metrics`, `BACKUP_RESTORE.md`...) plutôt que d'improviser une
  nouvelle procédure.
- `FIRST_CUSTOMER_ONBOARDING.md` — s'adresse à l'OPÉRATEUR, pas au client
  (le parcours d'inscription en libre-service, lui, existe déjà depuis
  v1.0/AR-0064) : quelles intégrations valider avant un premier client
  réel, et comment, en s'appuyant sur l'outillage AR-0172.
- `RUNBOOK.md` — point d'entrée unique des tâches d'exploitation
  courantes (quotidiennes/hebdomadaires/à la demande), y compris les
  limites connues à ne jamais oublier en astreinte (pas d'alerting
  proactif, stockage démo non persistant, intégrations non validées en
  conditions réelles dans cet environnement).
- `ENVIRONMENT_VARIABLES.md` — référence vérifiée par recherche exhaustive
  de tous les `process.env.X` du dépôt (jamais une simple recopie de
  `.env.example`, qui peut diverger du code réel) : 45 variables
  distinctes recensées, catégorisées, avec leur défaut et leur fichier
  source.
