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
