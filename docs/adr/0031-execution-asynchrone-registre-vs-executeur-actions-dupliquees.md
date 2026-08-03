# ADR 0031 — Exécution intrinsèquement asynchrone, séparation Registre/Exécuteur, et actions dupliquées délibérément entre les deux moteurs

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le Workflow Engine (v0.6) expose des points d'entrée SYNCHRONES :
`triggerManualRun`/`retryWorkflowRun` créent un run puis appellent
`executeWorkflowRun` dans le même appel, et l'action `workflow.run_subworkflow`
pilote un run imbriqué jusqu'à un état stable avant de rendre la main (voir
ADR 0019). Le noyau de jobs durable de l'Automation Engine (ADR 0030) rend ce
modèle inadapté : un noeud `action` peut rester `QUEUED`/`CLAIMED`/`RUNNING`
pendant un temps arbitraire (verrou indisponible, limite de concurrence
atteinte, disjoncteur ouvert, tentative différée) — un appelant qui
attendrait synchroniquement bloquerait une requête HTTP pour une durée non
bornée.

## Décision

- **Aucun point d'entrée de l'Automation Engine n'attend un run jusqu'au
  bout.** `createAutomationRun` (Automation Registry) ne fait qu'ouvrir le
  run (`QUEUED`) ; `advanceAutomationRun` (Job Executor) fait progresser le
  graphe d'UNE génération et revient dès qu'il n'y a plus rien à faire
  immédiatement — jamais de blocage sur un `AutomationJob`/sous-run en vol.
  `triggerManualAutomationRun`/`retryAutomationRun` (API `POST
  /api/automations/[id]/run`, `POST /api/automations/runs/[runId]/retry`)
  amorcent le run (un seul appel à `advanceAutomationRun`) et renvoient
  immédiatement — le run peut donc être `RUNNING`, pas seulement terminal.
- **Séparation stricte Automation Registry / Job Executor.**
  `registry/automation-service.ts` est la couche "identité + registre" :
  CRUD, versions, cycle de vie (DRAFT/ACTIVE/INACTIVE/ARCHIVED), export/
  import, indexation des `AutomationTriggerBinding` — jamais d'exécution.
  `executor/job-executor.ts` (+ `run-state.ts`/`tick-graph.ts`) est le SEUL
  endroit qui fait progresser un graphe ou exécute un job. Cette séparation
  mirrore celle du Workflow Engine (`workflow-service.ts` vs
  `execution-engine.ts`), volontairement.
- **`automation.call`/noeud `subautomation` : asynchrone**, contrairement à
  `workflow.run_subworkflow` (synchrone, borné par `MAX_DRIVE_ITERATIONS`).
  Le job/noeud crée le run enfant (`parentRunId`) et rend la main
  immédiatement ; `advanceAutomationRun` sonde son statut à chaque
  génération suivante (`pollSubautomationNode`), et **le run enfant devenu
  terminal notifie explicitement son parent**
  (`notifyParentRun`/`advanceAutomationRun(parentRunId)`) — sans quoi rien
  ne ferait jamais progresser le parent, puisqu'il n'est ni `QUEUED` (repris
  par le cron) ni propriétaire du job qui vient de se terminer.
- **Actions dupliquées délibérément entre les deux moteurs.**
  `http.request`/`agent.call`/`workflow.call` (Automation Engine) ont un
  équivalent quasi identique côté Workflow Engine
  (`http.call_api`/`agent.call`/`workflow.run_subworkflow`) — code dupliqué
  VOLONTAIREMENT plutôt que partagé : les deux moteurs gardent des
  interfaces de contexte découplées (`AutomationJobContext` vs
  `WorkflowActionContext`, formes proches mais pas identiques), pour ne
  jamais créer de dépendance de compilation entre `automation/` et
  `workflows/`.

## Conséquences

- Un appelant de l'API Automation Engine (route HTTP, UI, autre module) ne
  peut jamais bloquer indéfiniment un thread de requête — au prix de devoir
  interroger le run (`GET /api/automations/runs/[runId]`) ou s'appuyer sur un
  mécanisme de rappel pour connaître son résultat final.
- La notification parent→enfant→parent est un point de complexité réel et
  testé explicitement (`tests/automation/job-executor.test.ts`, scénario
  `subautomation`) — sans elle, un run parent contenant un noeud
  `subautomation` resterait bloqué `RUNNING` indéfiniment.

## Alternatives écartées

- **`automation.call` synchrone (comme `workflow.run_subworkflow`)** :
  écartée — contredirait directement la garantie "jamais de blocage" du
  noyau de jobs, et un run enfant peut légitimement contenir des noeuds
  `action` en attente d'un job durable, pas seulement du calcul en mémoire.
- **Partager les actions HTTP/agent/workflow entre les deux moteurs** :
  écartée pour cette phase — le gain (moins de code) ne justifiait pas de
  créer une dépendance de compilation entre `automation/` et `workflows/`,
  ni d'unifier deux formes de contexte d'action qui ont des besoins
  légèrement différents (ex. `setVariable` synchrone en mémoire côté
  Workflow Engine vs propagation différée via `AutomationRun.context` côté
  Automation Engine, entre deux appels de fonction distincts).
