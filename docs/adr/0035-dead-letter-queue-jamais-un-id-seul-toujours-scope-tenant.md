# ADR 0035 — Dead Letter Queue : jamais une table séparée, jamais un id seul — toujours scopée organisation/workspace

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief demande une Dead Letter Queue (DLQ) au sein du Retry Engine. La DLQ
d'un système de jobs multi-tenant expose typiquement deux risques : (1)
introduire une table dédiée qui duplique l'état déjà présent sur le job
lui-même, et (2) exposer une action de relance (`replay`) identifiée par le
seul id du job — un vecteur classique d'accès inter-tenant si l'id est
prévisible ou fuité (ex. dans un journal, une URL partagée).

## Décision

- **Jamais une table séparée** : la DLQ est une simple vue/service sur
  `AutomationJob.status = 'DEAD_LETTERED'` — le statut posé par le Job
  Executor quand le Retry Engine (`decideRetry`) décide de ne plus
  retenter (épuisement des tentatives, stratégie `"manual"`, ou condition
  non remplie pour `"conditional"`). `listDeadLetters` et
  `replayDeadLetter` (`src/lib/automation/dlq/dlq.ts`) interrogent/mettent
  à jour directement `AutomationJob`.
- **`replayDeadLetter(jobId, scope)` exige `{organizationId, workspaceId}`**
  en plus de `jobId` — jamais une relance par id seul. La requête
  `findFirst({ where: { id: jobId, organizationId, workspaceId } })` renvoie
  `NotFoundError` (jamais `ForbiddenError`, même convention que partout
  ailleurs dans Autorun depuis l'ADR 0026 v0.7 : ne jamais confirmer
  l'EXISTENCE d'une ressource d'un autre tenant) si le job n'appartient pas
  au scope de l'appelant.
- **`replayDeadLetter` est la SEULE façon de faire ressortir un job de la
  DLQ** — remise en file explicite (`QUEUED`, tentative réinitialisée à 0,
  `error` effacé via `Prisma.JsonNull`), jamais automatique : un job
  dead-lettered ne revient jamais tout seul dans le flux normal, même après
  correction d'un disjoncteur ou d'une dépendance externe.
- **Les routes API (`GET /api/automations/dlq`, `POST
  /api/automations/dlq/[jobId]/replay`) dérivent le scope de l'ACTEUR
  authentifié** (`actor.organization.id`/`actor.workspace.id`), jamais d'un
  paramètre de requête — un utilisateur ne peut donc jamais fournir un
  `organizationId` arbitraire pour élargir sa propre portée.

## Conséquences

- Aucune donnée dupliquée entre `AutomationJob` et une hypothétique table
  `DeadLetter` — le job dead-lettered garde tout son historique
  (`AutomationJobLog`, `attempt`, `retryPolicy`) visible d'un seul geste.
- Une relance de job d'une autre organisation échoue systématiquement en
  `404`, jamais en `403` — cohérent avec la politique de sécurité globale
  d'Autorun (ADR 0026) : ne jamais révéler qu'une ressource existe ailleurs.
- Rejouer un job dont le run parent est déjà terminal (`FAILED`) ne fait
  PAS automatiquement repartir le run — limite assumée et documentée dans
  le commentaire de la route de relance : la reprise d'un run entier passe
  par `POST /api/automations/runs/[runId]/retry` (nouveau run), pas par la
  DLQ (voir ADR 0031, jamais de modification en place d'un run terminal).

## Alternatives écartées

- **Table `AutomationDeadLetter` dédiée** : écartée — aurait dupliqué l'état
  déjà complet sur `AutomationJob`, avec un risque de désynchronisation
  (ex. un job "dead-lettered" dans les deux tables mais avec des logs
  différents).
- **`replayDeadLetter(jobId)` sans scope** : écartée d'emblée — aurait
  permis à n'importe quel appelant authentifié de rejouer le job de
  N'IMPORTE QUELLE organisation en devinant/obtenant un id, violation
  directe de l'isolation multi-tenant exigée par le brief.
