# ADR 0044 — v1.1 : décisions d'implémentation — extraction d'agents, agenda, préférences de notification

- **Date** : 2026-08-04
- **Statut** : accepté

## Contexte

`ADR 0043` documente les décisions structurantes prises EN AMONT du plan
`v1.1` (`AR-0160` à `AR-0185`). Cette ADR complémentaire documente quatre
décisions prises PENDANT l'implémentation elle-même, qui affinent ou
précisent des choix non entièrement anticipés par `ADR 0043` — utile pour
qu'un futur changement ne les redécouvre pas par accident.

## Décision

### Agent Qualification (`AR-0173`) : réutilise directement les outils de l'Agent Commercial, jamais un moteur de scoring dupliqué

Alternative envisagée : donner à `qualification-agent` ses propres outils
`qualification.score_prospect`/`qualification.qualify_prospect`, en
enveloppe fine autour de `scoring-engine.ts`. Écartée : dupliquer la
déclaration d'outils (même si l'implémentation sous-jacente reste
partagée) aurait doublé la surface d'API à maintenir en synchronisation
(deux clés d'outil, deux entrées de catalogue, deux permissions
déclarées) pour un bénéfice nul — le nouvel agent n'a besoin d'aucune
étape supplémentaire. Décision : `qualification-agent` appelle
directement `commercial.score_prospect`/`commercial.qualify_prospect`
(les mêmes outils, déjà déclarés) — seule la logique de décision de
seuil (score → `TO_QUALIFY` vs `QUALIFIED`) lui est propre. Conséquence
assumée : une `CommercialProspect` reste rattachée par clé étrangère à
l'installation qui l'a créée (`installationId`), donc l'Agent
Qualification ne peut qualifier que des prospects qu'il a lui-même créés
(ou dont l'installation a changé) — pas ceux créés par une installation
différente de l'Agent Commercial. Acceptable : `CommercialProspect` reste
un modèle de démonstration du Framework des Agents (voir `ADR 0038`),
jamais le CRM réel (`Lead`) utilisé par les 7 agents métier.

### Paramètres d'agenda (`AR-0179`) : capacité par créneau comme généralisation du même algorithme, jamais une branche séparée

`planning.suggest_slots` calculait déjà les créneaux libres par fusion de
plages occupées (empaquetage par la gauche). Ajouter une capacité par
créneau (> 1 réservation simultanée tolérée) aurait pu introduire un
second algorithme dédié (comptage de chevauchements par balayage,
indépendant du premier). Décision : généraliser l'algorithme existant —
un balayage (`computeFullRanges`) transforme la liste de créneaux occupés
en liste de plages "pleines" (where le nombre de chevauchements atteint
la capacité), puis le MÊME empaquetage par la gauche s'applique à ces
plages pleines plutôt qu'aux créneaux bruts. Pour une capacité de 1
(valeur par défaut, comportement inchangé pour toute organisation qui n'a
rien configuré), les plages pleines sont exactement les créneaux occupés
fusionnés — résultat rigoureusement identique à l'ancien code, vérifié
par le test de non-régression existant (`tests/agents/planning-
agent.test.ts`).

`BusinessHours` (horaires d'ouverture) est un modèle Prisma dédié (une
ligne par jour de la semaine), pas un champ JSON sur `Organization` —
même patron que `PipelineStage` (v0.9) : une ligne par jour permet un
`upsert` ciblé (`@@unique([organizationId, dayOfWeek])`) sans jamais
relire/réécrire un blob JSON entier pour changer un seul jour.

### Préférences de notification (`AR-0180`) : seul le canal APP est aujourd'hui réellement filtré

`NotificationPreference` modélise deux canaux (`APP`/`EMAIL`) et les
réglages exposent les deux à l'utilisateur. Cependant, le point
d'application réel (`notification.create`, Automation Engine ET Workflow
Engine) ne crée QUE des `Notification` applicatives — aucun chemin de
code n'envoie un email en réaction à une préférence `EMAIL`. Décision
assumée : exposer le canal `EMAIL` dans le modèle et l'UI dès maintenant
(schéma stable, pas de migration future nécessaire quand un job
`email.send` consultera ces mêmes préférences), mais ne vérifier
`isNotificationEnabled(..., NotificationChannel.APP)` qu'au seul point
d'émission qui existe réellement aujourd'hui. Documenté ici pour qu'un
futur brancher-l'email ne suppose pas, à tort, que le filtrage `EMAIL`
est déjà actif.

## Conséquences

- L'extraction d'un agent qui réutilise les outils d'un autre agent
  (plutôt que de dupliquer sa surface d'outils) devient le patron par
  défaut pour toute future extraction similaire dans le Framework des
  Agents.
- `computeFullRanges` (capacité) est réutilisable pour tout futur calcul
  de créneaux qui aurait besoin de tolérer plusieurs occupations
  simultanées (ex. un futur module de réservation de salle), sans
  réécrire l'empaquetage.
- Le canal `EMAIL` de `NotificationPreference` est un contrat déclaré mais
  pas encore appliqué — visible dans le code (`hub-service.ts`/
  `notification-action.ts` ne le consultent jamais) et maintenant
  explicite ici plutôt que découvert par surprise.

## Alternatives écartées

- **Outils dédiés `qualification.*` en enveloppe autour de
  `scoring-engine.ts`** : écartée — double la surface d'API sans bénéfice.
- **Algorithme de capacité séparé de l'empaquetage existant** : écarté —
  la généralisation par balayage couvre la capacité 1 (comportement
  historique) ET la capacité > 1 sans code dupliqué.
- **`BusinessHours` en champ JSON unique sur `Organization`** : écartée —
  un `upsert` par jour est plus simple et plus sûr contre les écritures
  concurrentes qu'un remplacement complet d'un blob JSON.
- **Filtrer immédiatement le canal `EMAIL` en absence de tout job
  `email.send` réactif à une préférence** : écarté — aurait ajouté du
  code mort (un filtre qui ne protège aucun envoi réel).
