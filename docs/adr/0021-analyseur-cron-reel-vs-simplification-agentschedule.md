# ADR 0021 — Analyseur cron réel pour le Workflow Engine (contrairement à la simplification d'AgentSchedule)

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

`AgentSchedule` (v0.3) documente une simplification connue : une
planification récurrente reporte simplement sa prochaine échéance d'une
heure fixe, sans évaluer une véritable expression cron — acceptable à
l'époque car aucun agent métier réel n'avait de cadence exacte qui
importait encore (ADR implicite dans `scheduler.ts`). Le brief v0.6 liste
explicitement "Cron" comme déclencheur de premier ordre pour un moteur
qualifié de "professionnel" : la même simplification aurait été
trompeuse ici.

## Décision

- `src/lib/workflows/triggers/cron.ts` implémente un analyseur cron réel à
  5 champs (minute, heure, jour du mois, mois, jour de la semaine),
  supportant l'astérisque, les listes séparées par virgule, et le pas
  (`*/n`), avec la sémantique POSIX standard de combinaison OU entre
  jour-du-mois et jour-de-semaine quand les deux sont restreints.
  `matchesCron(expression, date)` est appelé une fois par minute par
  `processDueWorkflowCronTriggers` (voir `POST /api/cron/process-workflow-runs`),
  supposé invoqué au plus une fois par minute par l'infrastructure de
  cron — même hypothèse implicite que le traitement des `AgentRun`/
  `AgentSchedule` en file.
- Volontairement non supporté : plages (`1-5`), alias (`@daily`), noms de
  mois/jours en toutes lettres — ajoutables plus tard sans changer la
  signature de `matchesCron`/`getNextCronRun`, si un besoin réel se
  présente.

## Conséquences

- Un workflow planifié se déclenche à l'instant réellement configuré, pas
  approximativement une heure plus tard — cohérent avec le mot
  "professionnel" du brief.
- `getNextCronRun` (utilisé pour l'aperçu dans l'éditeur, pas pour le
  déclenchement lui-même) balaie minute par minute jusqu'à un an — un coût
  acceptable pour un usage ponctuel d'aperçu, pas pour le chemin chaud de
  déclenchement.

## Alternatives écartées

- **Réutiliser la simplification d'`AgentSchedule`** (report fixe d'une
  heure) pour rester cohérent avec le code existant : écartée — le brief
  demande explicitement "Cron" comme déclencheur de premier ordre pour un
  moteur "professionnel" ; une planification qui ignore l'expression
  configurée aurait été un défaut visible immédiatement par un
  utilisateur, contrairement au contexte v0.3 où aucun agent réel n'en
  dépendait encore.
- **Bibliothèque cron externe** (`node-cron`, `cron-parser`) : écartée —
  l'analyseur nécessaire (5 champs, sans plages ni alias) tient en une
  quarantaine de lignes sans dépendance ; ajouter une dépendance pour ce
  périmètre n'était pas justifié.
