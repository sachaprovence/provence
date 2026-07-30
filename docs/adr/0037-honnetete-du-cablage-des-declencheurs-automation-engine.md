# ADR 0037 — Honnêteté du câblage des déclencheurs : sous-ensemble réel de points d'émission vs catalogue déclaré-mais-non-câblé

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le catalogue des déclencheurs de l'Automation Engine
(`triggers/builtin-triggers.ts`) compte 26 entrées demandées par le brief
(Cron, Date, Heure, Intervalle, Webhook, API, Event Bus, Workflow terminé,
Agent terminé, Email reçu, Lead créé/modifié/supprimé, Client créé, Paiement
reçu, Document signé, Utilisateur connecté/créé, Organisation créée,
Workspace créé, Import/Export terminé, Erreur détectée, Webhook externe,
Déclencheur manuel/personnalisé). La plupart de ces évènements métier
(paiement reçu, document signé, client créé...) n'ont AUCUN point d'émission
réel dans Provence 360 aujourd'hui (pas de facturation, pas de signature
électronique) — les déclarer comme "actifs" serait mensonger. Le Workflow
Engine (v0.6) a déjà établi ce précédent : ses évènements déclarés
(`prospect.created`, `payment.received`...) ne sont JAMAIS auto-déclenchés
par une route réelle de la plateforme, à une seule exception près
(`agent.run.completed`, via `subscribeAgentRunFinishedTrigger`).

## Décision

- **Catalogue complet, câblage honnête et partiel.** Les 26 types de
  déclencheurs sont tous déclarés (visibles dans la palette de l'éditeur,
  utilisables via l'API générique `POST /api/automations/[id]/run` en
  manuel, ou via `fireAutomationsForEvent`/`fireAutomationWebhook` en
  direct) — mais seul un sous-ensemble DÉFENSABLE est réellement câblé à un
  point d'émission de la plateforme :
  - `lead.created`/`lead.updated`/`lead.deleted` (`POST/PUT/DELETE
    /api/leads[...]`) ;
  - `user.registered`/`user.logged_in` (`POST /api/auth/register`/`login`) ;
  - `organization.created`/`workspace.created` (`register`, et
    `workspace-service.ts#createWorkspace`) ;
  - `import.completed` (`POST /api/leads/import`) ;
  - `schedule.cron` (`processDueAutomationSchedules`, voir ADR 0036) ;
  - `webhook.received` (route webhook dédiée) ;
  - `manual.user_action` (API/UI, toujours disponible par construction).
- **`trigger-engine.ts#REAL_EMISSION_EVENT_KEYS` documente EXPLICITEMENT**
  cette liste fermée — l'abonnement (`subscribeAutomationTriggerEvents`) ne
  s'abonne qu'à ces clés précises, jamais un abonnement générique "à tout
  évènement". Ajouter un nouveau point d'émission réel exige d'ajouter la
  clé à cette liste, un changement explicite et grep-able.
- **`fireAutomationsForEvent` filtre STRICTEMENT par organisation** quand le
  payload en fournit une (`payload.organizationId`) — contrairement à
  `workflows/trigger-engine.ts#triggerWorkflowsForEvent`, qui ne le fait
  pas (limite latente non corrigée ici : hors périmètre, ce module est
  nouveau, pas une modification du Workflow Engine). Un évènement de
  l'organisation A ne peut jamais déclencher une automatisation d'une autre
  organisation.
- **Exclusion volontaire du contrôle de suppression email dans
  `lead.create`** (job générique) : la vérification `isSuppressed` de la
  route API réelle (`POST /api/leads`) n'est PAS reproduite dans le job
  générique — un job d'automatisation crée un lead simple, sans dupliquer
  ni contourner la logique métier déjà correcte de la route existante.

## Conséquences

- Un opérateur qui consulte le catalogue des déclencheurs ne peut jamais
  être surpris de découvrir qu'un déclencheur "actif" ne se déclenche
  jamais réellement — la distinction (câblé vs déclaré) est explicite dans
  le code, pas seulement dans une documentation externe.
- Étendre le câblage réel (ex. quand la facturation existera) se limite à
  ajouter une clé à `REAL_EMISSION_EVENT_KEYS` et un appel
  `publishAutomationEvent(...)` au bon endroit — aucun changement
  d'architecture.
- Les 7 clés réellement câblées sont couvertes par des tests d'intégration
  dédiés (`tests/automation/trigger-engine.test.ts`), incluant l'isolation
  multi-tenant.

## Alternatives écartées

- **Ne déclarer QUE les déclencheurs réellement câblés** : écartée — le
  brief demande explicitement le catalogue complet de 26 types, et un
  déclencheur "déclaré mais pas encore câblé" reste immédiatement
  utilisable via le mode manuel/API/webhook, une valeur réelle même sans
  émission automatique.
- **Abonnement générique à tout évènement publié** (au lieu d'une liste
  explicite) : écartée — aurait rendu impossible de savoir, en lisant le
  code, quels évènements déclenchent réellement une automatisation sans
  exécuter le programme ; la liste explicite est un artefact de
  documentation vivant.
