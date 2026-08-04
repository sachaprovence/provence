# Runbook d'exploitation (v1.3, AR-0177)

Point d'entrée unique pour les tâches d'exploitation courantes — chaque
section renvoie vers le document détaillé plutôt que de dupliquer son
contenu. Pour un incident en cours, voir `INCIDENT_RESPONSE.md` plutôt que
ce document.

## Tâches quotidiennes (automatisées)

| Tâche | Mécanisme | Vérification |
|---|---|---|
| Sauvegarde PostgreSQL + vérification par restauration réelle | `npm run backup:scheduled` en cron/systemd timer (`BACKUP_RESTORE.md` §9) | `npm run backup:metrics-report` |
| Traitement des relances de séquences, factures en retard, webhooks sortants, jobs Automation/Workflow Engine, planifications d'agent | 7 routes `POST /api/cron/*`, authentifiées par `CRON_SECRET` (v1.3, AR-0176) | `/settings/metrics` (file d'attente/workers) |

## Tâches hebdomadaires

| Tâche | Mécanisme |
|---|---|
| Purge des sauvegardes hors politique de rétention | `npm run backup:prune -- <répertoire> 30` (dry-run d'abord, `BACKUP_RESTORE.md` §10) |
| Revue des métriques (coût IA, taux d'échec email, latence API, taux d'erreur, file d'attente) | `/settings/metrics` (v0.9 bis AR-0049, étendu v1.3 AR-0174) |
| Revue de la Dead Letter Queue | `/automations/dlq` — jobs définitivement en échec après épuisement des tentatives |

## Tâches avant chaque déploiement

Voir `DEPLOYMENT_CHECKLIST.md` — ne jamais improviser, la check-list est
la référence unique.

## Tâches ponctuelles / à la demande

| Tâche | Commande |
|---|---|
| Auditer l'état de configuration des intégrations tierces (sans compte réel) | `npm run integrations:validate -- <organizationId>` (v1.3, AR-0172) |
| Vérifier la cohérence stockage ↔ base de données | `npm run backup:consistency-check` (v1.2, AR-0166) |
| Scanner le dépôt à la recherche de secrets | `npm run security:scan-secrets` (v1.3, AR-0176) — déjà en CI sur chaque PR, rejouable localement |
| Vérifier l'arrêt propre sous charge après une modification de `src/instrumentation.ts`/`src/lib/health/*`/Dockerfile | `npm run verify:graceful-shutdown` (v1.3, AR-0173) |
| Tester une migration Prisma sur une base neuve | `npm run test:migrations:fresh` (v1.2, AR-0163) |

## Surfaces d'observabilité disponibles

- **Liveness** : `GET /api/health/live` — le processus répond-il, sans
  aucune vérification de dépendance.
- **Readiness** : `GET /api/health/ready` — base de données joignable,
  migrations appliquées, configuration valide, ET pas d'arrêt en cours
  (v1.3, AR-0173). C'est cette route qu'un orchestrateur/load balancer
  doit interroger pour décider de router du trafic.
- **Métriques par organisation** (`/settings/metrics`, réservé aux
  administrateurs de l'organisation) : coût IA, taux d'échec email,
  latence/taux d'erreur API, file d'attente/workers de l'Automation
  Engine.
- **Historique des sauvegardes** (CLI uniquement, jamais un endpoint web
  — réglage de déploiement, pas une métrique par organisation, voir ADR
  0046 §AR-0174) : `npm run backup:metrics-report`.
- **Capture d'erreurs externe** (Sentry, si `SENTRY_DSN` configuré) :
  toute erreur 5xx applicative ET toute erreur non interceptée par un
  gestionnaire de route (rendu de Server Component, Server Action, Proxy
  — v1.3, AR-0173, `onRequestError`).

## Limites connues (à ne jamais oublier en astreinte)

- Aucune alerte proactive sur seuil (coût IA, taux d'échec, latence,
  taux d'erreur) — les métriques existent mais ne déclenchent aucune
  notification automatique (constat P2 connu depuis la revue OWASP v0.10,
  toujours ouvert). La surveillance reste active (revue humaine),
  jamais passive.
- Le stockage `demo` (fichiers locaux) perd son contenu à chaque
  redéploiement sans volume persistant dédié — `STORAGE_PROVIDER=s3`
  requis avant tout usage client réel avec pièces jointes.
- Aucune intégration tierce (Stripe, Gmail, Outlook, S3, Twilio) n'a été
  validée contre un compte réel dans cet environnement de développement
  (v1.3, AR-0172) — voir `docs/release/integration-validation-evidence-v1.3.md`
  et `FIRST_CUSTOMER_ONBOARDING.md` avant tout premier client réel.

## Voir aussi

- `DEPLOYMENT.md` / `DEPLOYMENT_CHECKLIST.md` — déploiement, rollback.
- `BACKUP_RESTORE.md` — sauvegarde, restauration, rétention, RTO/RPO.
- `INCIDENT_RESPONSE.md` — conduite à tenir face à un incident.
- `ENVIRONMENT_VARIABLES.md` — référence complète des variables
  d'environnement.
- `FIRST_CUSTOMER_ONBOARDING.md` — check-list avant le premier client réel.
