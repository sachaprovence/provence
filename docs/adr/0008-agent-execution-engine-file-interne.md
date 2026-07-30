# ADR 0008 — Moteur d'exécution des agents : file interne sur PostgreSQL, pas de nouvelle brique d'infra

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le moteur d'exécution des agents (`AgentRun`) a besoin d'une file
d'attente (priorités, reprises, délais, timeouts, annulations).
`ROADMAP.md` MOD-15 prévoit déjà une infrastructure asynchrone dédiée
(`pg-boss`) — mais cette phase (v0.3) n'a pas pour objet MOD-15, et
`pg-boss` n'est pas encore une dépendance du projet.

## Décision

Le moteur d'exécution des agents utilise le **même pattern déjà éprouvé**
que `src/lib/sequence-engine.ts` : une table (`AgentRun`) porte l'état de
la file (`QUEUED`, `scheduledAt`, `priority`, `attempt`), et une fonction
`processQueuedAgentRuns(now)` (`src/lib/agents/execution-engine.ts`)
traite les exécutions dues, appelée par une route cron dédiée
(`POST /api/cron/process-agent-runs`, même convention que
`POST /api/cron/process-sequences`).

## Conséquences

- Aucune nouvelle dépendance d'infrastructure introduite dans cette phase
  (cohérent avec ADR 0001 : pas de brique avant besoin réel prouvé).
- Le remplacement futur par `pg-boss` (MOD-15) sera un changement
  d'implémentation interne de `execution-engine.ts` (la fonction qui
  "trouve les exécutions dues et les traite"), pas une réécriture de
  l'API publique du moteur (`createAgentRun`, `cancelAgentRun`, etc.) ni
  du modèle de données `AgentRun` — celui-ci sert déjà de source de
  vérité persistante, ce que `pg-boss` viendrait seulement accélérer/
  fiabiliser à plus grande échelle.
- Limite assumée : pas de vrai parallélisme distribué pour l'instant (le
  traitement est séquentiel, comme `processDueSequences`) — suffisant pour
  le volume actuel (aucun agent métier encore actif), à revisiter quand
  MOD-15 sera traité.

## Alternatives écartées

- **Introduire `pg-boss` maintenant** : écartée — anticiperait un besoin
  d'infrastructure (MOD-15) non encore justifié par un volume réel, et
  élargirait le périmètre de cette phase au-delà de "infrastructure des
  agents".
