# Guide de réponse aux incidents (v1.3, AR-0177)

Ce document couvre la conduite à tenir face à un incident de production —
pas la prévention (voir `DEPLOYMENT_CHECKLIST.md`) ni la sauvegarde/
restauration en détail (voir `BACKUP_RESTORE.md`, référencé ci-dessous pour
chaque scénario qui l'implique).

## Niveaux de sévérité

| Niveau | Définition | Exemple |
|---|---|---|
| **SEV1 — Critique** | Application indisponible, perte de données en cours ou suspectée, faille de sécurité activement exploitée. | Base de données injoignable, fuite de secret confirmée, corruption de données. |
| **SEV2 — Élevé** | Fonctionnalité majeure indisponible, dégradation significative pour une partie des clients. | Envoi d'email en échec pour tous les clients, file d'attente d'automatisations bloquée. |
| **SEV3 — Modéré** | Dégradation mineure, contournement possible. | Latence API élevée sur une route secondaire, une intégration tierce en panne côté fournisseur. |

## Première réaction (tous niveaux)

1. **Confirmer l'incident** — `GET /api/health/ready` (readiness, v1.2
   AR-0167) et `GET /api/health/live` (liveness) : distinguer "le
   processus a planté" de "une dépendance (base de données, config) est
   indisponible" — voir `src/lib/health/readiness.ts`.
2. **Consulter les métriques récentes** — `/settings/metrics` (taux
   d'erreur, latence, file d'attente/workers — v1.3 AR-0174) pour situer
   le début et l'ampleur de la dégradation.
3. **Consulter les journaux structurés** (`logger`, JSON) — chaque erreur
   applicative porte un `requestId` (v1.3, AR-0173) permettant de relier
   un ticket de support ou une ligne de log précise à une exécution
   précise via l'en-tête de réponse `X-Request-Id`.
4. **Consulter Sentry** si `SENTRY_DSN` est configuré (v0.9 bis, AR-0048)
   — capture automatique de toute erreur inattendue (5xx), y compris
   celles levées pendant le rendu/une Server Action (v1.3, AR-0173,
   `onRequestError`).

## Scénarios courants

### Base de données injoignable (SEV1)

- **Symptôme** : `/api/health/ready` renvoie `503`, `checks.database: "error"`.
- **Action** : vérifier la disponibilité du serveur PostgreSQL lui-même
  (hors du périmètre applicatif) avant toute action côté application —
  ne jamais redémarrer l'application en boucle en espérant que cela
  résolve un problème d'infrastructure sous-jacent.
- **Si la base est down mais les données ne sont pas perdues** : attendre
  le rétablissement, `/api/health/ready` redevient `200` automatiquement
  dès que la connexion est rétablie (aucune action manuelle requise côté
  application).
- **Si une perte de données réelle est suspectée** : `BACKUP_RESTORE.md`
  §7 (procédure de restauration manuelle, jamais automatisée).

### Arrêt en cours / déploiement — readiness à `503` mais processus vivant

- **Symptôme** : `/api/health/ready` renvoie `503` avec `checks.shutdown:
  "error"`, mais `/api/health/live` reste `200`.
- **Ce n'est PAS un incident** — c'est le comportement attendu pendant un
  arrêt propre (v1.3, AR-0173) : l'instance draine ses requêtes en cours
  et refuse du nouveau trafic. Se résout de lui-même dans le délai de
  grâce (`docker-compose.yml#stop_grace_period`, 30s). N'agir que si l'état
  persiste largement au-delà de ce délai (voir §"Arrêt qui ne se termine
  jamais" ci-dessous).

### Sauvegarde planifiée manquante ou en échec (SEV2, latent)

- **Symptôme** : `npm run backup:metrics-report` (v1.3, AR-0174) signale
  qu'un type de sauvegarde n'a aucune exécution récente, ou la dernière
  exécution est en échec.
- **Action** : vérifier que le cron/systemd timer (voir `BACKUP_RESTORE.md`
  §9) est toujours actif sur l'hôte ; relancer manuellement
  `npm run backup:scheduled` pour confirmer que le problème n'est pas
  applicatif (espace disque, identifiants) avant d'investiguer
  l'ordonnanceur.
- Ne jamais laisser ce cas ouvert plus de 24h (RPO documenté,
  `BACKUP_RESTORE.md` §9) sans action.

### Taux d'erreur API élevé (SEV2/SEV3 selon l'ampleur)

- **Symptôme** : `/settings/metrics` (v1.3, AR-0174) — `errorRate` élevé
  sur une ou plusieurs routes.
- **Action** : identifier la/les routes concernées (`byRoute` dans le
  même tableau de bord), corréler avec les journaux structurés via
  `requestId`/`route` ; si un déploiement récent en est la cause probable,
  rollback immédiat (`DEPLOYMENT_CHECKLIST.md`).

### File d'attente/workers de l'Automation Engine bloquée (SEV2)

- **Symptôme** : `/settings/metrics` — `queue.dueNow` élevé et croissant,
  `workers.active` à 0 alors que `workers.poolSize` > 0.
- **Action** : vérifier que le cron applicatif (`POST /api/cron/
  process-automations`) est bien appelé à la fréquence attendue (au
  moins une fois par minute, voir `scheduler/schedule-engine.ts`) — un
  déclenchement cron manquant est la cause la plus fréquente, pas un bug
  du moteur lui-même. Consulter la Dead Letter Queue (`/automations/dlq`)
  pour les jobs définitivement en échec après épuisement des tentatives.

### Échec de paiement / webhook Stripe (SEV3, sauf si `BILLING_PROVIDER=stripe` en volume)

- **Symptôme** : journal structuré `"Webhook Stripe expiré (horodatage
  hors tolérance)."` ou `"Échec de paiement d'abonnement."`.
- **Action** : vérifier `STRIPE_WEBHOOK_SECRET` (horodatage expiré indique
  souvent une horloge serveur désynchronisée, pas un problème Stripe) ;
  une organisation qui bascule en statut `RESTRICTED` peut régulariser
  elle-même sa facturation (le blocage d'écriture exempte explicitement
  `/api/billing/**`, voir `src/proxy.ts`).

### Arrêt qui ne se termine jamais (au-delà du délai de grâce)

- **Symptôme** : un conteneur reste "Stopping" bien au-delà de 30s.
- **Action** : une requête en cours de traitement bloque anormalement le
  drain (ex. appel externe sans timeout). Après investigation, un arrêt
  forcé (`docker kill`/SIGKILL) est acceptable en dernier recours — mais
  toujours investiguer la cause après coup (une requête qui bloque le
  drain indéfiniment est un bug à corriger, pas un état normal).

### Fuite de secret suspectée (SEV1)

1. Révoquer/faire pivoter IMMÉDIATEMENT le secret concerné auprès du
   fournisseur (Stripe, AWS, OAuth Google/Microsoft...) — avant toute
   investigation approfondie.
2. `npx tsx scripts/scan-secrets.ts` (v1.3, AR-0176) sur l'état actuel du
   dépôt pour confirmer l'étendue exacte.
3. Vérifier les journaux structurés : le masquage (`REDACTED_PATHS`,
   `src/lib/logger.ts`) empêche qu'un secret RÉCEMMENT introduit
   apparaisse en clair dans les logs applicatifs — mais ne protège pas
   contre un secret déjà commité en clair dans le code source lui-même.
4. Documenter l'incident (cause racine, secret concerné, action de
   rotation) — jamais refermer silencieusement une fuite de secret
   confirmée.

## Après résolution (tous niveaux)

- Documenter la cause racine et l'action corrective dans un post-mortem
  bref (même une SEV3) — le format n'est pas prescrit ici, mais l'absence
  de trace écrite d'un incident est elle-même un risque pour la
  prochaine occurrence similaire.
- Si l'incident révèle un gap de monitoring/alerting, l'ajouter comme
  suivi explicite (voir `RUNBOOK.md` pour l'état actuel des métriques
  disponibles et leurs limites connues).
