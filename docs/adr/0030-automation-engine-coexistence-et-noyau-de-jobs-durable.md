# ADR 0030 — Automation Engine (v0.8) : coexistence avec le Workflow Engine et noyau de jobs durable comme différenciateur "enterprise"

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.8 demande un « véritable Automation Engine Enterprise », comparable
aux meilleurs moteurs du marché (Temporal, n8n, Zapier, Make, GitHub Actions),
avec Scheduler, Trigger Engine, Queue Manager, Job Executor, Retry Engine,
Delay Engine, Timeout Manager, Event Dispatcher, Automation Registry,
Condition Engine, Lock Manager, Concurrency Manager, Priority Manager, Dead
Letter Queue, Persistence Layer et Audit Layer — modulaires, découplés,
remplaçables. Le Workflow Engine (v0.6) existe déjà et couvre déjà une bonne
partie de ce périmètre (graphe versionné, registres déclaratifs, moteur
d'exécution ré-entrant, voir ADR 0018/0019). La première décision, avant
d'écrire la moindre ligne de code, est : **étendre le Workflow Engine en place,
ou construire un second moteur ?**

## Décision

- **Coexistence, jamais remplacement.** `src/lib/automation/` est un module
  entièrement nouveau, indépendant de `src/lib/workflows/` : aucun fichier du
  Workflow Engine n'est modifié pour l'intégrer (zéro risque de régression
  sur v0.1–v0.7). Les deux moteurs partagent des utilitaires génériques
  pré-existants (bus d'évènements, moteur d'expressions — voir ADR
  0034/0037) sans jamais dépendre l'un de l'autre en sens inverse.
- **Le différenciateur "enterprise" : exécution par noyau de jobs durable.**
  Le Workflow Engine (v0.6) exécute chaque noeud en mémoire, dans le même
  appel que `executeWorkflowRun` (ré-entrant via `WorkflowRunStep`, voir ADR
  0019). L'Automation Engine va plus loin : chaque noeud `action` d'un
  `AutomationRun` devient une ligne `AutomationJob` PERSISTÉE — réclamée
  atomiquement par un Queue Manager (ADR 0032), verrouillable (Lock
  Manager), soumise à des limites de concurrence indépendantes, retryable
  selon une politique par noeud (Retry Engine), et in fine
  dead-letterable (DLQ). C'est ce qui distingue un "moteur d'exécution" d'un
  "planificateur" : chaque unité de travail est individuellement observable,
  reprise, priorisée — jamais seulement un statut de run global.
- **Nouveaux types de noeuds au-delà du Workflow Engine** : `switch`
  (branchement à N voies), `map` (itération PARALLÈLE — un job enfant par
  élément, par opposition à `loop`, séquentielle), `join` explicite avec un
  mode `all`/`any` déclaré (referme le point laissé ouvert par l'ADR 0019
  pour le Workflow Engine, sans jamais le modifier).
- **Numérotation ADR** : cette phase reprend la numérotation à 0030 (0023 à
  0029 documentent déjà le Knowledge/Memory/Context Engine, v0.7).

## Conséquences

- Le Workflow Engine reste la solution la plus simple pour une orchestration
  synchrone légère (tick en mémoire, pas de table de jobs) ; l'Automation
  Engine est le choix pour tout ce qui doit survivre à un redémarrage de
  processus, être audité job par job, ou passer par des files/verrous/limites
  de concurrence explicites. Les deux se complètent (`workflow.call`
  synchrone, `automation.call`/noeud `subautomation` asynchrone — voir ADR
  0031) plutôt que de se substituer.
- Toute la suite de l'implémentation (Queue Manager, Job Executor, Retry
  Engine, Circuit Breaker, DLQ, Scheduler...) est architecturée pour ce
  modèle "graphe + jobs durables", détaillé dans les ADR 0031 à 0037.

## Alternatives écartées

- **Étendre `WorkflowRunStep`/`execution-engine.ts` en place** : écartée —
  aurait mélangé deux modèles d'exécution incompatibles (tick en mémoire vs
  job durable réclamé par un Queue Manager) dans un seul moteur, avec un
  risque de régression élevé sur v0.1–v0.7 pour un bénéfice réduit (perte de
  la séparation claire entre les deux niveaux de garanties).
- **Un seul type de "step" pour les deux moteurs** : écartée — le Workflow
  Engine n'a pas besoin (et ne demande pas) des garanties de reprise/verrou/
  concurrence par étape ; les lui imposer aurait été un sur-engineering pour
  l'existant, sans que le brief v0.6 ne l'ait jamais demandé.
