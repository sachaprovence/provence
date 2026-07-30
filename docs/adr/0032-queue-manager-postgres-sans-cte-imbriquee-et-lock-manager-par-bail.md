# ADR 0032 — Queue Manager Postgres sans CTE imbriquée (leçon d'un bug de concurrence réel) et Lock Manager par bail plutôt que verrou consultatif

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief demande une abstraction de file compatible avec plusieurs
fournisseurs (BullMQ, Redis, RabbitMQ, SQS, Kafka, mémoire) et un mécanisme
de verrouillage (mutex/locks) pour la concurrence. Aucune infrastructure
Redis/RabbitMQ/Kafka/SQS n'existe dans ce projet (confirmé via
`docker-compose.yml`/`package.json`) — même situation que Milvus/FAISS/
LanceDB en v0.7 (ADR 0025/0027). Le fournisseur par défaut doit donc être
100% Postgres, et réclamer un lot de jobs prêts de façon ATOMIQUE (jamais
deux fois le même job à deux workers concurrents) est le coeur de la valeur
d'un "Queue Manager".

## Décision

- **`QueueProvider` découple la DÉCOUVERTE du travail du STOCKAGE durable** :
  le stockage reste toujours `AutomationJob` (Postgres), quel que soit le
  fournisseur actif. Un fournisseur "push" (BullMQ, SQS, Kafka...)
  utiliserait `notify()` pour réveiller ses workers ; le fournisseur "poll"
  par défaut (Postgres) ignore `notify()` et découvre le travail par requête
  périodique dans `claim()`. Les fournisseurs BullMQ/Redis/RabbitMQ/SQS/
  Kafka restent des stubs honnêtes déclarés (même discipline que l'ADR
  0027) : ils lèvent une erreur explicite à l'appel, jamais un faux succès.
- **`PostgresQueueProvider#claim` : `SELECT ... FOR UPDATE SKIP LOCKED` en
  DEUX instructions simples**, jamais une CTE imbriquée
  (`WITH claimed AS (UPDATE ... RETURNING ...) SELECT ...`) avec un
  fragment `Prisma.sql` imbriqué pour le filtre optionnel `jobType IN
  (...)`. **Ceci corrige un bug de concurrence réel, découvert par test de
  charge** : la première implémentation (CTE imbriquée) a laissé un lot de
  jobs réclamés dépasser la `LIMIT` demandée sous forte charge concurrente
  (40 jobs, 8 workers, limite 3 chacun — un worker a réclamé 3 jobs au lieu
  de 2 attendus, tous marqués `CLAIMED`/`claimedBy` par LUI, confirmant que
  c'est bien SA requête qui a mal borné le lot, pas une fuite d'un autre
  test). La cause : Postgres ne garantit pas l'ordre du `RETURNING` d'une
  CTE avec une sous-requête filtrée par une liste dynamique de la même
  façon qu'une requête simple — corrigé en séparant `SELECT ... FOR UPDATE
  SKIP LOCKED` (candidats) de l'`UPDATE`/`findMany` final (ordre garanti par
  `orderBy` natif Prisma). Un test de charge dédié
  (`tests/automation/queue.test.ts`, "respecte toujours `limit` sous forte
  charge concurrente") garde ce correctif contre toute régression.
- **`MemoryQueueProvider` re-filtre/re-trie par appartenance à `matches`**
  plutôt que de faire confiance à l'ordre renvoyé par `findMany` — même
  leçon appliquée par précaution, même sans preuve d'un bug identique côté
  mémoire.
- **`LockManager` : verrou par BAIL (lease) sur une clé arbitraire, jamais
  un verrou consultatif Postgres (`pg_advisory_lock`)** — écarté à cause de
  son affinité de connexion, incompatible avec le pool de connexions de
  Prisma (une connexion peut être rendue au pool et réutilisée par un autre
  appelant entre l'acquisition et la libération). `PostgresLockManager`
  utilise un `INSERT ... ON CONFLICT (lockKey) DO UPDATE ... WHERE
  expiresAt < now() OR holderId = $holderId` atomique : un bail expire
  automatiquement (`leaseMs`), un worker qui plante ne retient jamais un
  verrou indéfiniment.
- **Rate limiter en mémoire, par processus** — limite assumée et
  documentée (`rate-limiter.ts`) : dans un déploiement multi-instance, la
  limite réelle est `N × instances`, pas `N` global. Corriger cela
  nécessiterait un compteur partagé (Redis `INCR`/fenêtre glissante
  Postgres), hors périmètre de cette phase.

## Conséquences

- Le claim atomique est désormais vérifié par un test de charge réaliste,
  pas seulement des tests unitaires isolés — la discipline "stress-tester
  avant de faire confiance" est documentée ici pour être reproduite sur
  tout futur composant critique du noyau de jobs.
- Le Lock Manager reste correct même si Prisma change de stratégie de pool
  de connexions (pas de dépendance à l'affinité de session).

## Alternatives écartées

- **Garder la CTE imbriquée et ajouter un `ORDER BY` dans le `RETURNING`** :
  écartée — n'aurait pas garanti le respect strict de `LIMIT` sous charge
  concurrente (le bug observé), seulement l'ordre des lignes retournées.
- **Verrou consultatif Postgres (`pg_advisory_lock`)** : écarté pour la
  raison ci-dessus (affinité de connexion incompatible avec le pool Prisma).
- **Rate limiter partagé (Redis) dès cette phase** : écarté — aucune
  infrastructure Redis n'existe dans le projet ; ajouter cette dépendance
  uniquement pour le rate limiting aurait été disproportionné.
