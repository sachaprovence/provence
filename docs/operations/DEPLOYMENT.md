# Déploiement, rollback et procédure sans perte de données (v1.2, AR-0169)

Ce document couvre le déploiement standard, le rollback applicatif, le
rollback de migration, et la procédure de déploiement sans perte de
données. Voir `docs/operations/BACKUP_RESTORE.md` pour la sauvegarde/
restauration (préalable recommandé avant tout déploiement en production
réelle).

## 1. Déploiement standard

```bash
docker build -t provence-app:<tag> .
docker run -d --name provence-app \
  -e DATABASE_URL="postgresql://…" \
  -e AUTH_SECRET="…" \
  -e NEXT_PUBLIC_APP_URL="https://…" \
  -p 3000:3000 \
  provence-app:<tag>
```

Au démarrage du conteneur (`CMD` du `Dockerfile`) : `prisma migrate
deploy` s'exécute d'abord (applique les migrations en attente, jamais
destructif — voir §3), PUIS le serveur de production démarre
(`next start`, devient le processus principal via `exec`, voir §4).

**Prérequis** : `AUTH_SECRET`/`DATABASE_URL` valides (le serveur refuse de
démarrer sinon, voir `src/lib/env.ts`/`src/instrumentation.ts`) ;
`GET /api/health/ready` doit répondre 200 avant de considérer le
déploiement réussi (voir AR-0167).

**Risques** : un `AUTH_SECRET` absent/trop court fait échouer le
démarrage explicitement (jamais un démarrage avec une configuration
dégradée silencieuse) — comportement voulu.

## 2. Configuration additive du proxy/reverse-proxy en amont

Si Autorun est placé derrière un reverse-proxy (nginx, Caddy, load
balancer managé) :
- Transmettre `X-Forwarded-For` (utilisé pour le débit de connexion et le
  verrouillage de compte, voir AR-0155) et `X-Forwarded-Proto` (nécessaire
  pour que `secure: true` sur le cookie de session — actif dès
  `NODE_ENV=production`, voir `src/lib/auth.ts` — corresponde à la
  réalité du trafic HTTPS terminé en amont).
- Ne PAS retirer l'en-tête `X-Request-Id` posé par Autorun
  (`src/proxy.ts`, AR-0168) — le reverse-proxy peut au contraire en
  ajouter un s'il n'existe pas encore, Autorun le respecte s'il est déjà
  présent (voir `resolveRequestId`).
- Les en-têtes de sécurité HTTP (`X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, voir
  `next.config.ts`, AR-0169) sont déjà posés par Autorun — un reverse-proxy
  ne doit pas les écraser avec des valeurs plus permissives.

## 3. Migrations : additives par défaut, jamais de rollback automatique

Convention du projet (voir contrainte v1.2 : "les migrations doivent
rester additives autant que possible") : Prisma Migrate ne fournit pas de
mécanisme "down" officiel dans ce projet — **aucun script ne défait
automatiquement une migration déjà appliquée**, par choix délibéré :
défaire une migration sur une base contenant des données réelles est
intrinsèquement risqué (perte de colonnes/données) et ne doit jamais être
automatisé.

**Procédure en cas de besoin de rollback de schéma** :
1. Ne JAMAIS modifier ou supprimer un fichier de migration déjà appliqué
   en production (`prisma/migrations/<horodatage>_.../migration.sql`).
2. Écrire une NOUVELLE migration qui défait le changement (ex. une
   migration qui ajoutait une colonne `NOT NULL` → nouvelle migration qui
   la rend nullable, ou la supprime si aucune donnée n'en dépend déjà).
3. Tester cette nouvelle migration avec `npm run test:migrations:fresh`
   (AR-0163) avant de la déployer.

**Pourquoi additif par défaut rend un rollback applicatif sûr** : si
l'application revient à une version antérieure (§4) alors que le schéma a
déjà avancé, une migration additive (nouvelle colonne nullable, nouvelle
table) n'empêche jamais l'ancien code de fonctionner — il ignore
simplement les nouveaux champs. Une migration destructive (colonne
supprimée, contrainte resserrée) casserait l'ancien code : c'est
exactement pourquoi ce type de migration doit être évité ou accompagné
d'un déploiement applicatif qui ne revient jamais en arrière au-delà de
ce point.

## 4. Rollback applicatif (image précédente)

```bash
# 1. Identifier le tag de l'image précédemment déployée (ex. dans le
#    registre d'images ou l'historique de déploiement de l'orchestrateur).
# 2. Redéployer cette image précédente — AUCUNE migration de base de
#    données n'est nécessaire si la règle d'additivité (§3) a été
#    respectée : le schéma actuel (plus récent) reste compatible avec le
#    code plus ancien.
docker run -d --name provence-app-rollback \
  -e DATABASE_URL="…" -e AUTH_SECRET="…" -e NEXT_PUBLIC_APP_URL="…" \
  -p 3000:3000 \
  provence-app:<tag-précédent>

# 3. Vérifier GET /api/health/ready avant de basculer le trafic.
# 4. Basculer le trafic (bascule de load balancer / DNS / reverse-proxy).
```

**Arrêt propre du conteneur précédent** (v1.2, AR-0169 ; v1.3, AR-0173) :
`docker stop` envoie `SIGTERM`, relayé par `tini` (PID 1 du conteneur, voir
Dockerfile) au processus `next start` (qui a remplacé le shell via `exec` —
voir le commentaire du `CMD`) : les requêtes en cours ont le temps de se
terminer avant l'arrêt effectif. Deux effets à la réception du signal,
vérifiés empiriquement sous charge réelle par
`npm run verify:graceful-shutdown` (voir ADR 0046) :

1. **Immédiatement** (quelques ms) : `GET /api/health/ready` bascule sur
   `503` (`checks.shutdown: "error"`) — un orchestrateur qui interroge
   cette route avant de router du trafic cesse d'envoyer de NOUVELLES
   requêtes à cette instance dès le début de l'arrêt, sans attendre que la
   connexion soit effectivement refusée.
2. **Pendant le délai de grâce** (`docker-compose.yml#stop_grace_period:
   30s`, ou `docker stop -t <secondes>` en CLI) : les requêtes déjà en
   cours de traitement se terminent normalement (`next start` cesse
   d'accepter de nouvelles connexions mais ne coupe jamais les
   existantes), puis le processus quitte de lui-même.

`GET /api/health/live` (liveness) reste volontairement à `200` pendant tout
ce temps — seule la readiness reflète l'arrêt en cours, jamais la
vivacité du processus (voir §1).

## 5. Procédure de déploiement sans perte de données (résumé)

1. **Sauvegarder** (`docs/operations/BACKUP_RESTORE.md` §1-2) — une
   sauvegarde PostgreSQL vérifiée par restauration réelle avant tout
   déploiement qui touche au schéma.
2. **Déployer les migrations d'abord** (déjà l'ordre du `CMD` du
   Dockerfile — jamais l'inverse) : le schéma doit être prêt avant que le
   nouveau code ne le sollicite.
3. **Vérifier la readiness** (`GET /api/health/ready`, §1) avant de
   basculer le trafic vers la nouvelle version.
4. **Garder l'ancienne image disponible** pour un rollback rapide (§4) —
   ne jamais supprimer une image tout juste remplacée avant confirmation
   que la nouvelle version est stable en production depuis un délai
   raisonnable.
5. **En cas d'anomalie détectée après bascule** : rollback applicatif
   immédiat (§4, sûr grâce à l'additivité du schéma, §3) ; si une perte de
   données est suspectée, suivre `docs/operations/BACKUP_RESTORE.md` §6-7
   (vérification de cohérence, puis restauration si nécessaire).
