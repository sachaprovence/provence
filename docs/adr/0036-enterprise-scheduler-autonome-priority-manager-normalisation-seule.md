# ADR 0036 — Enterprise Scheduler autonome (pas une extension du cron du Workflow Engine), Priority Manager en simple normalisation, "workers actifs" en heuristique honnête

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le Workflow Engine (v0.6) possède déjà un évaluateur cron minimal
(`workflows/triggers/cron.ts`, `matchesCron`, UTC uniquement, 5 champs). Le
brief v0.8 demande un Scheduler "extrêmement robuste" : cron complexes,
fuseaux horaires, heure d'été (DST), jours ouvrés, jours fériés/exceptions,
périodes de blackout, fenêtres d'exécution — un périmètre fonctionnel
significativement plus large. Le brief demande aussi un Priority Manager, et
une observabilité incluant les "workers" — alors qu'aucun registre de workers
vivants n'existe (le worker du noyau de jobs est une fonction appelée par un
cron, pas un processus longue-durée enregistré quelque part).

## Décision

- **Scheduler autonome, jamais une extension de `workflows/triggers/cron.ts`.**
  `src/lib/automation/scheduler/{cron-engine.ts, timezone.ts,
  schedule-engine.ts}` est un module entièrement nouveau : `cron-engine.ts`
  parse un champ cron (avec plages `1-5`, listes `1,3,5`, pas `*/2`, alias
  `@daily`/`@hourly`...) — différence de nature avec l'évaluateur UTC-only
  existant, pas une simple amélioration incrémentale. `timezone.ts` extrait
  les champs "heure murale" (`year/month/day/hour/minute/weekday`) pour un
  fuseau IANA donné via `Intl.DateTimeFormat` NATIF — aucune nouvelle
  dépendance (`date-fns-tz`/`luxon` délibérément évités). `schedule-engine.ts`
  combine cron + fuseau/DST + jours ouvrés + jours fériés + blackout +
  fenêtres d'exécution en une seule fonction sans état (`matchesSchedule`),
  testable et sans dépendance à un ordonnanceur externe.
- **Seul `schedule.cron` est réellement câblé** (`processDueAutomationSchedules`,
  `trigger-engine.ts`) — même honnêteté que `workflows/trigger-engine.ts#
  processDueWorkflowCronTriggers`, qui ne câble que "schedule.cron" et pas
  "schedule.time" malgré sa présence au catalogue (v0.6). `schedule.date`/
  `schedule.interval` sont déclarés au catalogue des déclencheurs mais pas
  encore déclenchés automatiquement — voir ROADMAP.md.
- **Priority Manager = normalisation, jamais un second tri.** Le tri effectif
  (priorité décroissante, puis `scheduledAt` croissant) est déjà appliqué
  par le Queue Manager (`PostgresQueueProvider#claim`, ADR 0032) ;
  `priority/priority-manager.ts` ne fait que nommer des niveaux (`LOW`/
  `NORMAL`/`HIGH`/`CRITICAL`) au-dessus de l'entier `AutomationJob.priority`,
  pour une utilisation cohérente dans l'UI/API plutôt que des nombres
  magiques dispersés.
- **"Workers actifs" = heuristique honnête, jamais un nombre inventé.** Aucun
  registre de workers vivants n'existe (le worker est une fonction, pas un
  processus enregistré) ; le tableau de bord
  (`dashboard-service.ts#getAutomationDashboard`) compte les `claimedBy`
  DISTINCTS parmi les jobs réclamés dans la fenêtre récente
  (`ACTIVE_WORKER_WINDOW_MS`, 60 s) comme approximation d'"activité
  récente" — jamais présenté comme un décompte de processus réellement en
  vie.

## Conséquences

- Le Scheduler peut évaluer des plannings réalistes (ex. "tous les jours
  ouvrés à 9h, heure de Paris, sauf le 25 décembre") sans dépendance
  externe ni service tiers.
- Le Workflow Engine (v0.6) reste inchangé et continue d'utiliser son
  propre évaluateur cron minimal — aucune migration n'est imposée.
- Le tableau de bord affiche un nombre de "workers actifs" qui peut sous-
  ou sur-estimer l'activité réelle si un worker reste inactif plus de 60 s
  puis reprend, ou si plusieurs invocations du cron partagent le même
  `workerId` — limite documentée, acceptable pour un premier indicateur
  d'observabilité.

## Alternatives écartées

- **Étendre `workflows/triggers/cron.ts` pour supporter fuseaux/DST/
  calendriers** : écartée — `matchesCron` est UTC-only par construction et
  utilisé ailleurs (Workflow Engine) sans qu'un changement de comportement
  ne soit demandé pour cette phase ; un module autonome évite tout risque
  de régression sur v0.6.
- **`date-fns-tz`/`luxon` pour le calcul de fuseau horaire** : écartée —
  `Intl.DateTimeFormat` (natif Node/navigateur) suffit pour extraire les
  champs de date dans un fuseau IANA, sans nouvelle dépendance à maintenir.
- **Registre de workers vivants (heartbeat)** : écarté pour cette phase —
  aurait demandé une table dédiée et un mécanisme de heartbeat actif, hors
  périmètre du Job Executor lui-même ; l'heuristique par `claimedBy` récent
  offre un signal utile à un coût nul.
