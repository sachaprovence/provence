# ADR 0010 — Délégation du Director : pilotage synchrone intra-processus, pas de file distribuée

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

L'Agent Director (v0.4) doit déléguer une tâche à un autre agent, **attendre
son résultat**, éventuellement le relancer, puis fusionner les résultats de
plusieurs étapes avant de produire sa réponse finale. Le moteur d'exécution
existant (v0.3, ADR 0008) traite les `AgentRun` de façon asynchrone : un run
`QUEUED` est repris plus tard par `processQueuedAgentRuns` (cron), et une
reprise après échec est planifiée avec un délai de recul fixe de 30
secondes (`RETRY_BACKOFF_MS`, `execution-engine.ts`). Ce modèle convient à
un agent qui s'exécute seul, mais pas à un orchestrateur qui a besoin du
résultat d'un sous-agent **avant de continuer sa propre exécution**.

## Décision

Le moteur de délégation du Director (`src/lib/agents/director/delegation-engine.ts`)
pilote lui-même, de façon synchrone et dans le même processus, l'exécution
complète d'un agent délégué :

- `createAgentRun` (inchangé, v0.3) crée le `AgentRun` de l'agent cible.
- `driveRunToCompletion` appelle `executeAgentRun` en boucle jusqu'à un
  statut terminal (`SUCCEEDED`/`FAILED`/`CANCELLED`/`TIMED_OUT`), **sans
  attendre le délai de recul de 30 secondes** de la file générique — le
  Director décide lui-même, immédiatement, de retenter.
- Aucune fonction du moteur d'exécution n'est dupliquée ni contournée :
  `createAgentRun`/`executeAgentRun`/`cancelAgentRun` (v0.3) restent les
  seuls points d'entrée, le Director ne fait qu'les appeler de façon
  répétée et synchrone.

Une relance **délibérée** (`retryStepDelegation`, distincte de la reprise
automatique interne à un run) crée un **nouveau** `AgentRun`, relié au
précédent via `AgentRun.parentRunId` (champ du schéma v0.3, jusqu'ici
inutilisé — la reprise interne à un run réutilise la même ligne). La
lignée de reprise devient ainsi visible et traçable.

## Conséquences

- Le Director peut réellement "attendre" un résultat de sous-agent sans
  bricoler une machine à états asynchrone dans cette phase.
- Pas de vrai parallélisme distribué : des étapes "parallèles" (sans
  dépendance entre elles) sont déléguées dans la même boucle
  (`Promise.all`) du process Node courant — un vrai parallélisme entre
  processus/instances reste un sujet de MOD-15 (infrastructure
  asynchrone), pas de cette phase.
- Un plan avec beaucoup d'étapes séquentielles allonge d'autant la durée du
  run du Director lui-même (il reste "en cours" tant que ses sous-agents
  n'ont pas terminé) — acceptable tant qu'aucun agent métier réel à fort
  volume n'existe (cohérent avec la limite déjà assumée en ADR 0008).
- Le timeout et le nombre de tentatives d'une délégation restent
  configurables par appel programmatique à `delegateStep`
  (`opts.timeoutMs`/`opts.maxAttempts`), mais ne sont pas encore exposés
  comme un champ déclaratif de `AgentPlanStep` lui-même — limitation
  assumée, à lever si un besoin réel de configuration par étape apparaît.

## Alternatives écartées

- **File de délégation asynchrone avec pause/reprise de l'exécution du
  Director** : écartée pour cette phase — nécessiterait un mécanisme de
  continuation (sérialiser l'état d'exécution du Director entre deux
  appels de `execute()`), que le moteur d'exécution actuel ne fournit pas
  et qui dépasserait largement le périmètre "premier agent orchestrateur".
  Le pilotage synchrone intra-processus est un sous-ensemble volontairement
  plus simple, cohérent avec ADR 0008 (pas de brique avant besoin réel
  prouvé), à réviser avec MOD-15.
