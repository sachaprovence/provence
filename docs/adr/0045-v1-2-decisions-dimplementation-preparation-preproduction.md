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

## Conséquences

- Toute future entité avec pièce jointe/fichier stocké doit suivre le même
  patron : persister la clé brute du fournisseur séparément de toute URL
  dérivée, jamais reparser une URL pour retrouver une clé.
- Tout nouveau risque de configuration "valide mais dangereux en
  production" (sur le modèle du stockage démo) doit être évalué au cas par
  cas entre blocage au démarrage (`AUTH_SECRET`) et alerte visible non
  bloquante (`STORAGE_PROVIDER=demo`) selon que la configuration est
  intrinsèquement non sûre ou seulement risquée pour un usage donné.
- Un script de validation destiné à devenir un contrôle CI obligatoire ne
  doit réutiliser une suite E2E existante qu'après avoir vérifié
  empiriquement sa fiabilité dans ce nouveau contexte d'exécution — la
  complétude fonctionnelle d'une suite ne garantit pas son déterminisme
  sous charge.
