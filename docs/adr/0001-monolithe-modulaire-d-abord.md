# ADR 0001 — Monolithe modulaire d'abord, monorepo multi-package seulement si nécessaire

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

`docs/00-AUTORUN-VISION.md` §11-13 décrit une architecture cible en couches
(noyau générique / verticaux métier / fournisseurs / infrastructure) et une
organisation de dossiers en monorepo pnpm + Turborepo
(`apps/web`, `apps/worker`, `packages/*`, `verticals/*`). Le code existant
(MVP Provence 360) est aujourd'hui un unique projet Next.js (`src/app`,
`src/lib`, `src/components`).

La question : faut-il migrer vers le monorepo multi-package dès la phase de
fondations techniques (`v0.1`), ou rester sur la structure actuelle ?

## Décision

Rester sur un **monolithe modulaire** (un seul projet Next.js, séparation
par dossiers dans `src/`) tant qu'aucun besoin concret ne justifie
l'éclatement en plusieurs packages. La séparation en couches se fait
**dans le code** (conventions de dossiers, interfaces stables entre
modules — `src/lib/ai`, `src/lib/email`, futurs `src/lib/storage`,
`src/lib/payment`, `src/lib/calendar`), pas en paquets npm séparés.

Le passage à un vrai monorepo (`apps/worker` séparé, packages publiés en
interne) sera déclenché par un besoin explicite et concret, par exemple :
un worker de traitement asynchrone (`MOD-15`) dont le cycle de déploiement
doit diverger de l'application web, ou un deuxième frontend consommant le
même noyau métier.

## Conséquences

- Moins de complexité d'outillage à ce stade (pas de Turborepo, pas de
  gestion de versions internes entre packages).
- Le déploiement reste un seul artefact Docker (`Dockerfile` existant).
- Si le besoin de séparation apparaît plus tard, la migration demandera un
  effort dédié — accepté comme compromis raisonnable plutôt que de payer
  ce coût d'outillage par anticipation sans bénéfice immédiat.

## Alternatives écartées

- **Monorepo dès `v0.1`** : rejeté — aucun deuxième déploiement (worker,
  deuxième frontend) n'existe encore pour justifier la séparation ; le
  coût d'outillage (Turborepo, `package.json` par package, résolution de
  dépendances internes) ne serait pas compensé par un bénéfice réel à ce
  stade.
