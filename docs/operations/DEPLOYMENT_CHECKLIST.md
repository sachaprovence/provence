# Check-list de déploiement en production (v1.3, AR-0177)

Check-list opérationnelle — le détail de chaque étape (commandes exactes,
justification) est dans `docs/operations/DEPLOYMENT.md`. Ce document est
la version "à cocher" pour un déploiement réel, jamais un substitut à la
lecture de `DEPLOYMENT.md` la première fois.

## Avant tout déploiement touchant le schéma de base de données

- [ ] Sauvegarde vérifiée par restauration réelle : `npm run backup:scheduled`
      (chaîne sauvegarde + vérification, voir `BACKUP_RESTORE.md` §9).
- [ ] Toute nouvelle migration respecte la règle d'additivité (jamais de
      `DROP COLUMN`/`ALTER COLUMN ... NOT NULL` sans valeur par défaut sur
      une table déjà peuplée — voir `DEPLOYMENT.md` §3).
- [ ] `npm run test:migrations:fresh` vert (migration from-scratch sur une
      base neuve, v1.2 AR-0163).

## Avant tout déploiement (systématique)

- [ ] `npm run lint` — 0 erreur.
- [ ] `npm run typecheck` — 0 erreur.
- [ ] `npm run test` — 100 % vert.
- [ ] `npm run build` — succès.
- [ ] `npm audit` — 0 vulnérabilité (ou documentée/acceptée explicitement,
      voir `docs/security/`).
- [ ] `npm run security:scan-secrets` — 0 correspondance (v1.3, AR-0176).
- [ ] Les 4 suites E2E vertes (`npm run test:e2e{,:tenants,:automation,:onboarding}`)
      contre un environnement proche de la production (jamais seulement
      `next dev`).
- [ ] Variables d'environnement de la cible vérifiées contre
      `docs/operations/ENVIRONMENT_VARIABLES.md` — en particulier
      `AUTH_SECRET` (jamais la valeur par défaut de `.env.example` en
      production réelle).

## Déploiement

- [ ] Image construite et taguée (voir `.github/workflows/docker-build.yml`
      pour la validation CI de la construction — jamais poussée vers un
      registre depuis la CI).
- [ ] `prisma migrate deploy` s'exécute AVANT `next start` (déjà l'ordre du
      `CMD` du Dockerfile — ne jamais inverser).
- [ ] `GET /api/health/ready` renvoie `200` avant de basculer le trafic
      (voir `DEPLOYMENT.md` §4, `readiness.ts`).
- [ ] L'ancienne image reste disponible (rollback rapide, `DEPLOYMENT.md` §4).

## Après bascule du trafic

- [ ] `GET /api/health/ready` toujours `200` sous charge réelle (pas
      seulement au moment de la bascule).
- [ ] Aucune erreur 5xx anormale sur `/settings/metrics` (taux d'erreur,
      v1.3 AR-0174) dans les minutes suivant la bascule.
- [ ] `npm run backup:metrics-report` confirme que la prochaine sauvegarde
      planifiée est toujours programmée sur la nouvelle instance (si le
      cron/systemd timer vit sur l'hôte plutôt que dans le conteneur, rien
      à refaire — sinon, reconfigurer, voir `BACKUP_RESTORE.md` §9).

## En cas d'anomalie détectée après bascule

- [ ] Rollback applicatif immédiat (`DEPLOYMENT.md` §4) — sûr grâce à
      l'additivité du schéma.
- [ ] Si une perte de données est suspectée : `docs/operations/
      INCIDENT_RESPONSE.md` — ne jamais improviser une restauration en
      place sans suivre la procédure documentée (`BACKUP_RESTORE.md` §7).
