# ADR 0019 — Moteur d'exécution ré-entrant : sémantique de jointure, boucles, sous-workflows et compensation logique

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief demande un moteur capable de séquentiel, parallèle, attente,
timeout, annulation, reprise, retry, compensation et rollback logique,
avec un statut propre par étape. Construire cela correctement pour un
graphe arbitraire (branchements, boucles, sous-workflows) impose plusieurs
choix de sémantique qui n'étaient pas explicitement spécifiés dans la
demande — ce document les rend honnêtes et traçables, dans le même esprit
que les simplifications déjà documentées ailleurs (ADR 0008, ADR 0011).

## Décision

- **Ré-entrance basée sur `WorkflowRunStep`** : la progression réelle d'un
  run vit uniquement dans les lignes `WorkflowRunStep` persistées (jamais
  un état en mémoire du moteur). `executeWorkflowRun` peut donc être
  rappelée après une suspension (`WAITING`), un redémarrage serveur, ou une
  reprise planifiée : elle recharge l'état de chaque noeud et ne rejoue
  jamais un noeud déjà `SUCCEEDED`/`SKIPPED`/`CANCELLED`.
- **Jointure de type "OU" sur les arêtes entrantes** : un noeud avec
  plusieurs arêtes entrantes devient prêt dès qu'AU MOINS une arête est
  satisfaite, à condition que TOUTES ses sources soient terminales
  (`edgeIsSatisfied`/boucle de `executeWorkflowRun`). Ce n'est donc pas une
  jointure stricte "ET" façon BPMN (attendre explicitement que toutes les
  branches réussissent) — un noeud "join" dédié avec un mode `all`/`any`
  explicite pourrait être ajouté plus tard sans changer le format du
  graphe. Documenté ici plutôt que découvert en production.
- **Corps de boucle non-résumable finement** : les noeuds listés dans
  `LoopNodeData.bodyNodeIds` sont exclus du calcul de disponibilité du
  graphe racine et exécutés par un mini-moteur interne
  (`executeLoopNode`), séquentiellement, une itération à la fois. Leur
  progression n'est PAS persistée noeud par noeud : si le run est
  interrompu pendant une boucle, la reprise relance la boucle depuis la
  première itération. Simplification assumée (comme le calcul simplifié
  de prochaine échéance d'`AgentSchedule`, v0.3) — une reprise fine par
  itération nécessiterait un modèle de données par itération, hors
  périmètre de cette phase.
- **Sous-workflow synchrone borné** : `workflow.run_subworkflow` (et le
  noeud dédié "subworkflow", qui y délègue entièrement — un seul code,
  jamais deux implémentations) pilote le run imbriqué de façon synchrone,
  jusqu'à un nombre borné d'itérations (`MAX_DRIVE_ITERATIONS`, même
  principe que `director/delegation-engine.ts`, ADR 0010). Si le run
  imbriqué passe en `WAITING` (noeud d'attente), l'action échoue
  explicitement plutôt que de bloquer indéfiniment ou de simuler une
  reprise non implémentée — une vraie propagation de la suspension au run
  parent est un développement futur possible, pas un correctif silencieux.
- **Compensation "logique", pas transactionnelle** : `compensateActionKey`
  déclare, sur un noeud action, l'action à rejouer avec la sortie du noeud
  original si une étape ULTÉRIEURE du même run échoue (`policy: stop`
  implicite). Les compensations s'exécutent dans l'ordre inverse des
  succès, chacune indépendamment journalisée — ce n'est jamais un
  rollback SQL atomique (aucune transaction ne couvre l'ensemble d'un
  run, par construction : chaque étape peut appeler un service externe
  comme `email.send`).
- **Escalade vers l'Agent Director** : `onError: "escalate_director"`
  résout l'installation Director active du workspace
  (`resolveActiveInstallation({category: "director"})`, même helper que
  le Director utilise déjà) et lui crée un `AgentRun` (trigger `EVENT`,
  objectif décrivant l'échec) — exécuté une fois (pas piloté jusqu'au
  bout, le Director peut légitimement engager son propre plan) ; le run
  de workflow lui-même reste `FAILED`, marqué `escalatedToDirector: true`.

## Conséquences

- Un workflow bien conçu (sans dépendre d'une jointure stricte, sans
  boucle traversant une interruption planifiée) se comporte de façon
  robuste et reprend correctement après toute interruption.
- Les limites ci-dessus sont testées explicitement
  (`tests/workflows/execution-engine.test.ts`) plutôt que découvertes en
  production : reprise après `WAITING`, retry avec backoff, branche
  d'erreur, compensation.

## Alternatives écartées

- **Jointure stricte "ET" par défaut** : écartée pour cette phase — plus
  complexe à spécifier correctement pour un graphe arbitraire avec
  branches conditionnelles, et non explicitement demandée ; le OU-join
  actuel couvre déjà le parallélisme demandé (plusieurs actions
  indépendantes exécutées concurremment via `Promise.allSettled`).
- **Persistance fine de la progression de boucle** : écartée — le gain
  (reprise exacte à l'itération interrompue) ne justifiait pas la
  complexité d'un modèle de données par itération dans cette phase de
  fondation.
