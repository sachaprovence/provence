# ADR 0045 — v1.2 : décisions d'implémentation — préparation préproduction

- **Date** : 2026-08-04
- **Statut** : accepté (en cours de complément au fil de l'implémentation `v1.2`)

## Contexte

`v1.2` (`AR-0163` à `AR-0171`) vise à rendre Autorun réellement prêt pour
une préproduction stable et l'accueil contrôlé du premier client Provence
360 — sans nouveau vertical métier ni fonctionnalité commerciale majeure.
Comme `ADR 0044` pour `v1.1`, cette ADR documente les décisions prises
PENDANT l'implémentation elle-même (pas les choix structurants amont, qui
n'ont pas d'ADR dédiée séparée pour `v1.2` — le périmètre a été fixé
directement par la demande utilisateur). Une entrée est ajoutée par tâche
`AR-016x` au fur et à mesure.

## Décision

### AR-0163 — Test des migrations depuis zéro : script de test, pas un nouveau job de seed

Alternative envisagée : étendre `prisma/seed.ts` ou le script de démarrage
existant pour couvrir aussi la validation from-scratch. Écartée : mélanger
la responsabilité "peupler une base pour un usage normal" avec "valider
qu'une base neuve migre et démarre correctement" aurait rendu les deux
scripts plus difficiles à raisonner séparément, pour un bénéfice de
partage de code minime (quelques appels `spawnSync` communs). Décision :
script dédié `scripts/test-migrations-fresh-db.ts`, avec ses propres
garde-fous de nommage (`scripts/lib/temp-db-guardrails.ts`,
`assertSafeTempDbName`) extraits en module pur et testé isolément — jamais
appliqués une seule fois "en confiance", mais rappelés avant ET après les
opérations à risque (création, puis suppression finale de la base
temporaire).

Le script n'utilise PAS `tests/e2e/golden-path.mjs` comme vérification
fonctionnelle post-démarrage, malgré que ce soit la suite E2E de référence
existante. Deux exécutions indépendantes sur base temporaire fraîche ont
chacune échoué à une étape différente du même script (attentes de
simulation IA sensibles au timing sous charge), prouvant une fragilité
réelle et pas seulement liée à des données de démonstration épuisées. Un
contrôle CI nouvellement requis doit être fiable, pas seulement complet :
décision d'utiliser à la place un contrôle "smoke test" API dédié et
entièrement déterministe (connexion via l'API JSON, extraction du cookie
de session, requêtes authentifiées avec assertions de comptage exact),
sans aucune hypothèse de délai.

Le process serveur de test est démarré avec `detached: true` et arrêté par
`process.kill(-pid, "SIGKILL")` (signal de groupe de processus, PID
négatif) plutôt que `child.kill()` simple — `npx next start` engendre une
arborescence de processus descendants (`npx` → `next` → `next-server`)
que `SIGTERM` sur le seul PID direct ne termine pas de façon fiable.
Corollaire : la fonction d'échec du script (`fail()`) lève une exception
au lieu d'appeler `process.exit()` directement, pour que le bloc `finally`
contenant le nettoyage (arrêt serveur + suppression base temporaire)
s'exécute toujours avant la sortie du process, quel que soit le point
d'échec.

### AR-0164 — Stockage S3 production : clé de stockage persistée séparément de l'URL publique

`Attachment.storageKey` (nouveau champ, migration additive) est persisté
en plus de `Attachment.url` plutôt que dérivé de celle-ci au moment de la
suppression. Alternative envisagée : reparser l'URL publique pour en
extraire la clé du fournisseur au moment du `delete`. Écartée : le format
d'URL varie selon le fournisseur et peut changer dans le temps (CDN
devant le bucket, changement de `STORAGE_S3_PUBLIC_URL_BASE`), rendant un
reparsing a posteriori non fiable — une URL générée avant un changement de
configuration ne redonnerait plus la bonne clé. La clé brute, elle, ne
change jamais après l'upload.

`deleteAttachment` supprime le fichier physique (`storageProvider.delete`)
AVANT la ligne `Attachment` en base, jamais l'inverse. Si la suppression
du fichier échoue, la ligne reste en base (état cohérent, ré-essayable) —
alors que l'ordre inverse aurait pu laisser un fichier orphelin
indéfiniment après une suppression DB réussie mais dont personne ne
retenterait plus jamais la suppression physique (plus aucune ligne pour le
retrouver).

`isProductionWithDemoStorage` : contrairement à la validation de
`AUTH_SECRET` (qui lève une exception et empêche le démarrage), l'usage du
stockage démo en production est un choix opérateur risqué mais valide (ex.
démonstration temporaire) — décision de le signaler par un `logger.error`
non bloquant au démarrage plutôt que de refuser de démarrer, conformément
à l'exigence : le risque doit être visible et documenté, pas nécessairement
bloquant.

Validation d'upload (taille, type MIME, nom de fichier) centralisée dans
`src/lib/storage/validation.ts` et appelée par les DEUX fournisseurs
(`demo` et `s3`) plutôt que dupliquée — pour qu'un fichier invalide soit
rejeté de façon identique quel que soit le fournisseur actif ou le futur
point d'entrée (`POST /api/attachments/upload` aujourd'hui, un appel
direct depuis une automatisation demain).

Signature SigV4 généralisée à `GET`/`DELETE` (pas seulement `PUT`) via
`EMPTY_PAYLOAD_HASH` (hash SHA-256 de la chaîne vide, constante SigV4
bien connue pour les requêtes sans corps) plutôt qu'un second chemin de
signature dédié — même fonction `buildSignedRequest`, paramétrée par
méthode et hash de charge utile.

### AR-0165 — Diagnostic des intégrations : collision de numéro avec `v1.1`, prime la demande explicite `v1.2`

`AR-0165` désignait déjà, dans le plan `v1.1` (`ADR 0043`, plage `AR-0160`
à `AR-0185`), la fonctionnalité "Pipeline commercial : évènement de
transition d'étape" (livrée, voir `BACKLOG.md`/`docs/release/v1.1-
recette.md`). La demande explicite ayant lancé `v1.2` réutilise pourtant
ce même numéro pour une fonctionnalité entièrement différente ("Diagnostic
des intégrations"). Décision : suivre la demande utilisateur telle
qu'écrite (le numéro `AR-0165` de `v1.2` désigne bien le diagnostic
d'intégrations dans tous les commits/tests/documents de `v1.2`) plutôt que
d'improviser un numéro différent qui romprait la correspondance avec la
demande d'origine — cette note existe pour qu'une recherche future de
"AR-0165" sache qu'il existe deux fonctionnalités distinctes selon la
version (`v1.1` vs `v1.2`), toutes deux réelles et livrées.

Écran réservé à l'administrateur (`isAdmin`), couvrant Stripe/Twilio/
Gmail/Outlook/S3 avec 6 états possibles (`non configurée` /
`partiellement configurée` / `configurée` / `test réussi` / `test échoué`
/ `indisponible`). Décisions structurantes :

- **`IntegrationDiagnosticCheck` est un modèle Prisma dédié**, distinct
  d'`Integration` — sert à la fois d'audit ("qui a déclenché quel test,
  quand, avec quel résultat") et de source du dernier résultat affiché.
  Alternative écartée : stocker le dernier résultat directement sur
  `Integration.config` (comme un champ `lastTestStatus`) — rejetée car
  Stripe et S3 n'ont justement AUCUNE ligne `Integration` (configuration
  de déploiement, jamais par organisation), donc un modèle séparé,
  toujours scopé par `organizationId`, est le seul point commun aux 5
  intégrations.
- **L'état affiché ne fait JAMAIS confiance aveuglément au dernier test
  connu** : `listIntegrationDiagnostics` recalcule l'état de configuration
  à chaque appel et ne fait primer `TEST_SUCCESS`/`TEST_FAILED` que si la
  configuration est TOUJOURS complète au moment de la lecture — sinon un
  test réussi avant qu'un identifiant soit retiré afficherait à tort
  "test réussi" alors que l'intégration n'est plus utilisable.
- **Un test de connexion n'est JAMAIS tenté sur une configuration
  incomplète** (`testable` = `configState === "CONFIGURED"`), refusé
  explicitement côté service (`ValidationError`) même si l'appelant
  contourne l'UI — aucun appel à un tiers avec des identifiants
  partiels/absents.
- **Chaque test de connexion réutilise un appel bas-privilège déjà
  existant plutôt que d'en inventer un nouveau** : renouvellement de jeton
  OAuth pour Gmail/Outlook (`refreshGoogleAccessToken`/
  `refreshMicrosoftAccessToken`, sans envoyer aucun email), lecture seule
  pour Stripe (`GET /v1/balance`)/Twilio (`GET /Accounts/{Sid}.json`)/S3
  (`GET` signé sur une clé délibérément inexistante, 404 = succès) —
  jamais un envoi de test qui produirait un effet de bord réel (SMS,
  email, appel facturé).
- **Le message de résultat est TOUJOURS un texte généré côté serveur**
  (code HTTP, nature de l'erreur), jamais la configuration elle-même ni la
  réponse brute du fournisseur tiers — vérifié par test que la valeur du
  secret utilisé n'apparaît jamais dans le message persisté/journalisé/
  renvoyé à l'API, y compris en cas d'échec d'authentification.
- **Double limitation de débit** (`assertDiagnosticTestRateLimitAvailable`,
  5 tests / 5 minutes / organisation / intégration) : protège à la fois
  l'écran de diagnostic contre un abus ET l'API tierce réelle contre un
  appel excessif déclenché depuis Autorun.

### AR-0166 — Sauvegarde et restauration : deux clients S3 délibérément séparés, jamais un seul

`scripts/lib/s3-backup-client.ts` (accès administratif : liste TOUT le
bucket, écrit/lit/supprime à une clé exacte, toutes organisations
confondues) est un module ENTIÈREMENT SÉPARÉ de
`src/lib/storage/providers/s3.ts` (l'API applicative, org-scopée par
construction — `assertKeyBelongsToOrganization` appelé sur `download`/
`delete`). Alternative envisagée : exporter les méthodes bas-niveau déjà
présentes dans `S3StorageProvider` (`s3Fetch`/`buildSignedRequest`) pour
les réutiliser depuis les scripts de sauvegarde. Écartée : cela aurait
rendu accessible, depuis n'importe quel futur code applicatif important
`S3StorageProvider`, une capacité de lister/écrire/lire N'IMPORTE QUELLE
clé de N'IMPORTE QUELLE organisation — exactement le genre de capacité
qui ne doit exister que dans un script exécuté par un opérateur humain,
jamais atteignable depuis une route HTTP. Le coût (dupliquer ~80 lignes
de signature SigV4, déjà un algorithme standard et stable) est
délibérément accepté pour cette garantie de séparation des privilèges.

Aucune restauration "en place" (écrasant des clés/lignes réelles) n'est
automatisée — ni pour PostgreSQL ni pour S3. `verify-database-backup.ts`
restaure uniquement dans une base temporaire jetable (mêmes garde-fous de
nommage que AR-0163) ; `verify-s3-backup.ts` n'écrit que sous un préfixe
réservé (`__provence_backup_verify__/...`), jamais aux clés d'origine,
puis nettoie systématiquement ses propres copies de vérification. Une
restauration réelle en cas d'incident reste une procédure MANUELLE
documentée (`docs/operations/BACKUP_RESTORE.md` §7), avec confirmation
explicite de la cible par l'opérateur — cohérent avec la contrainte
"aucune opération destructive sur une base existante" appliquée à
l'ensemble de `v1.2`, qui s'étend ici par extension de principe à toute
donnée de stockage réelle.

Une sauvegarde n'est déclarée valide (`restoreVerified: true` dans son
fichier de métadonnées) QUE par le script de vérification correspondant,
jamais par le script de sauvegarde lui-même — empêche par construction
qu'une sauvegarde corrompue/tronquée soit considérée exploitable sur la
seule foi d'un code de sortie 0 de `pg_dump`/du téléchargement S3.

### AR-0167 — Liveness/readiness : `/api/health` conservé tel quel, deux nouvelles routes plutôt qu'une réécriture

Alternative envisagée : remplacer `GET /api/health` par une redirection
vers `/ready` ou changer sa forme de réponse pour inclure le détail
structuré. Écartée : cette route est déjà consommée par plusieurs
appelants existants qui n'attendent qu'un `{status}` minimal
(`Dockerfile`, `docker-compose.yml`, `scripts/test-migrations-fresh-db.ts`,
documentation) — la faire évoluer aurait cassé des intégrations externes
pour un bénéfice nul. Décision : `GET /api/health` délègue désormais à la
même évaluation (`evaluateReadiness()`, partagée) que le nouveau
`GET /api/health/ready`, mais conserve sa forme de réponse `{status}`
d'origine ; `GET /api/health/ready` (détail structuré par vérification)
et `GET /api/health/live` (aucune vérification, prouve seulement que le
processus répond) sont les points d'entrée recommandés pour un futur
déploiement orchestré (`readinessProbe`/`livenessProbe` Kubernetes ou
équivalent) — voir docs/02-ARCHITECTURE.md.

`evaluateReadiness()` ne vérifie que 3 choses, délibérément : connexion
base de données, migrations Prisma appliquées (compte de dossiers sur
disque vs `_prisma_migrations`, même technique que
`verify-database-backup.ts`, AR-0166), configuration d'environnement
(`loadEnv()`, déjà validée au boot par `instrumentation.ts` — revérifiée
ici en défense en profondeur, pas en confiance aveugle que le boot a eu
lieu récemment). AUCUNE intégration optionnelle (IA/email/SMS/facturation/
stockage, toutes avec repli "demo" non bloquant par construction) n'est
vérifiée — cohérent avec l'architecture existante où seules ces 3 choses
empêcheraient réellement l'application de fonctionner.

### AR-0168 — Observabilité : audit avant renforcement, jamais une réécriture de ce qui fonctionne déjà

Avant toute modification, audit du code existant sur les 8 catégories
demandées (logs structurés, identifiant de requête, corrélation de job,
erreurs applicatives, erreurs d'automatisation, jobs qui retentent, file
d'attente morte, échecs de webhook/paiement/stockage/intégration) — pour
ne renforcer que les points réellement faibles plutôt que réécrire un
système déjà correct :

- **Déjà solide, vérifié directement dans le code, non retouché** :
  corrélation de job par `runId`/`jobId` (`logger.child({ module:
  "automation-run"|"automation-job"|"workflow-run"|"agent-run", runId })`,
  `src/lib/automation/executor/job-executor.ts` et équivalents
  Workflow/Agent Engine) ; mise en DLQ journalisée
  (`sendToDeadLetter` + `logger.error` associé) ; échecs de livraison de
  webhook sortant journalisés avec `deliveryId`/`subscriptionId`/
  `attempts` (`src/lib/jobs/webhook-delivery-job.ts`) ; échecs de paiement
  journalisés (`src/lib/billing/subscription-service.ts`) ; erreurs
  d'intégration (Gmail/Outlook/Twilio/S3) déjà journalisées à leur point
  d'échec respectif, jamais un succès simulé (convention déjà en place
  depuis v0.9 bis) ; toute erreur applicative (`AppError`) et tout
  incident inattendu déjà journalisés de façon centralisée par
  `toApiErrorResponse` (`src/lib/errors.ts`), avec capture externe
  Sentry pour les 5xx (AR-0048).
- **Gap réel #1 — masquage des secrets incomplet** : `REDACTED_PATHS`
  (`src/lib/logger.ts`) ne couvrait que les clés EXACTEMENT nommées
  `password`/`token`/`authSecret`/`secret`/`authorization` — jamais
  `refreshToken`/`accessToken`/`clientSecret`/`authToken`/`apiKey`/
  `smtpPassword`/`secretAccessKey`, les noms RÉELLEMENT utilisés dans le
  code pour les jetons OAuth Gmail/Outlook, Twilio, S3, SMTP (pino
  compare le nom de clé littéralement, jamais par sous-chaîne). Corrigé
  en étendant la liste après audit des noms de champs réels du dépôt
  (`grep` exhaustif), vérifié par un test par champ
  (`tests/observability/logger.test.ts`) plutôt qu'une affirmation non
  vérifiée.
- **Gap réel #2 — aucun identifiant de corrélation par requête HTTP** :
  corrigé par `src/proxy.ts` (génère/respecte `X-Request-Id` sur CHAQUE
  requête, le transmet au gestionnaire de route via l'en-tête de requête
  ET au client via l'en-tête de réponse) et `src/lib/observability/
  request-id.ts` (`getRequestId`). **Limite assumée et documentée** :
  l'adoption dans les journaux applicatifs (`toApiErrorResponse`, etc.)
  n'est démontrée que sur un point d'entrée représentatif
  (`POST /api/billing/webhook`, qui correspond exactement à l'exemple
  "échecs de paiement" cité) plutôt que rétrofittée sur la totalité des
  ~150 routes API existantes — un tel rétrofit mécanique reste un travail
  futur explicitement identifié, pas silencieusement omis. L'infrastructure
  (en-tête toujours présent, aidant de lecture disponible) est en place
  pour que toute route l'adopte au fil de l'eau sans changement
  d'architecture supplémentaire.

### AR-0169 — Durcissement du déploiement : renforcé, jamais remplacé (contrainte explicite)

Conformément à la contrainte explicite ("ne remplace pas l'architecture
existante sans justification technique documentée"), audit d'abord :
l'utilisateur non-root (`nextjs`, uid 1001), le `chown` complet de
`/app`, les migrations exécutées avant le démarrage du serveur
(`prisma migrate deploy && … next start`), et les cookies de session
(`httpOnly`, `secure` en production, `sameSite: lax`) étaient DÉJÀ
corrects — non retouchés. Trois gaps réels corrigés :

- **Arrêt non propre** : `CMD ["sh", "-c", "cmd1 && cmd2"]` ne relaie PAS
  `SIGTERM` à `cmd2` par défaut (`sh` lance `cmd2` comme un enfant, pas un
  remplacement de process) — `docker stop` attendait le délai de grâce
  complet puis `SIGKILL`ait `next start` en pleine requête. Corrigé par
  `tini` en PID 1 (relais de signal + réclamation de zombies) ET `exec`
  avant `next start` (remplace le shell par le process Node.js, qui reçoit
  alors directement `SIGTERM` et peut drainer ses requêtes en cours).
- **Aucun en-tête de sécurité HTTP** : ni CSP, ni `X-Frame-Options`, ni
  `Referrer-Policy`, et `X-Powered-By: Next.js` renseignait gratuitement
  la pile technique à un attaquant. Corrigé via `next.config.ts#headers()`
  (appliqué à TOUTES les réponses, pages et API, plus tôt dans le pipeline
  Next.js que `src/proxy.ts`) — délibérément SANS Content-Security-Policy
  stricte : câbler une CSP par nonce sans casser l'hydratation React/
  l'éditeur de workflow/les visites 3D exige une vérification page par
  page hors budget de cette passe ; documenté comme travail futur plutôt
  que livré à moitié ou en mode `unsafe-inline` (qui annulerait l'essentiel
  du bénéfice d'une CSP).
- **Aucune validation CI de la construction de l'image** : un Dockerfile
  cassé n'aurait été découvert qu'au déploiement réel. Ajouté
  `.github/workflows/docker-build.yml` (construit l'image à chaque PR
  touchant `Dockerfile`/`.dockerignore`/dépendances/migrations — jamais
  poussée vers un registre).

**Limite assumée et documentée** : `docker build`/`docker run` n'ont pas
pu être exécutés directement dans cet environnement de développement
(absence de démon Docker) — les changements du Dockerfile ont donc été
vérifiés statiquement (relecture attentive de chaque instruction, usage
connu et documenté de `tini`/`exec` dans l'écosystème Docker) et seront
validés réellement par `docker-build.yml` au prochain déclenchement CI,
pas simplement affirmés corrects sans preuve. Les en-têtes de sécurité
HTTP et `X-Request-Id`, eux, ONT été vérifiés contre un vrai serveur de
production démarré localement (`next start`, hors conteneur).

### AR-0170 — Audit npm : `next` monté en version mineure après vérification que `next/image`/`sharp` est inutilisé

5 vulnérabilités `high` (0 critique) : `brace-expansion`×2 et `fast-uri`
(transitives, outillage de développement uniquement, corrigées par
`npm audit fix` sans `--force`) ; `postcss`/`sharp` (empaquetées par
`next@16.2.12`, corrigées par la montée non majeure `next@16.3.0`,
`isSemVerMajor: false`). Détail complet, chaîne de dépendances,
exploitabilité et décision par vulnérabilité :
`docs/security/npm-audit-v1.2-2026-08-04.md`.

Décision clé : avant d'appliquer la montée de `next`, recherche explicite
de tout usage de `next/image` (seul point d'entrée exécutant `sharp`,
la dépendance la plus significative des deux) — confirmée ABSENTE du
dépôt (`organization-form.tsx` utilise délibérément une balise `<img>`
classique, avec commentaire expliquant pourquoi). Cela élimine le
principal vecteur de rupture d'une montée de version de Next.js touchant
à l'optimisation d'image, avant même de lancer la suite de tests —
analyse d'incompatibilité RÉELLE, pas seulement "la CI est passée".

## Conséquences

- Toute future entité avec pièce jointe/fichier stocké doit suivre le même
  patron : persister la clé brute du fournisseur séparément de toute URL
  dérivée, jamais reparser une URL pour retrouver une clé.
- Tout nouveau risque de configuration "valide mais dangereux en
  production" (sur le modèle du stockage démo) doit être évalué au cas par
  cas entre blocage au démarrage (`AUTH_SECRET`) et alerte visible non
  bloquante (`STORAGE_PROVIDER=demo`) selon que la configuration est
  intrinsèquement non sûre ou seulement risquée pour un usage donné.
- Tout futur "test de connexion" vers un fournisseur tiers doit réutiliser
  un appel bas-privilège/lecture-seule déjà existant dans le code de
  production plutôt que d'inventer un nouvel appel dédié — évite un effet
  de bord réel et une divergence entre ce que le test vérifie et ce que le
  code de production utilise réellement.
- Un script de validation destiné à devenir un contrôle CI obligatoire ne
  doit réutiliser une suite E2E existante qu'après avoir vérifié
  empiriquement sa fiabilité dans ce nouveau contexte d'exécution — la
  complétude fonctionnelle d'une suite ne garantit pas son déterminisme
  sous charge.
- Tout nouveau champ de configuration destiné à porter un secret (jeton,
  clé API, mot de passe) doit être ajouté à `REDACTED_PATHS`
  (`src/lib/logger.ts`) ET couvert par un test dédié dans
  `tests/observability/logger.test.ts` avant son premier usage réel — ne
  jamais supposer qu'un nom de champ "évident" est déjà couvert par la
  redaction générique.
- Toute nouvelle route API qui journalise une erreur devrait inclure
  `requestId` (via `getRequestId(request)`,
  `src/lib/observability/request-id.ts`) dans le contexte journalisé —
  convention établie mais pas encore universellement appliquée (voir
  limite assumée ci-dessus).
