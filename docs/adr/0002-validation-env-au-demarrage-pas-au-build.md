# ADR 0002 — Valider l'environnement au démarrage du serveur, jamais pendant `next build`

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

`src/lib/env.ts` valide `process.env` avec un schéma Zod strict
(`AUTH_SECRET` ≥ 16 caractères, `DATABASE_URL` requis, etc.). Le
`Dockerfile` existant ne définit **que** `DATABASE_URL` pendant l'étape
`builder` (`next build` + `prisma generate`) — les secrets d'exécution
(`AUTH_SECRET` réel, etc.) ne sont fournis qu'au lancement du conteneur
(`docker-compose.yml`, étape `runner`).

Si la validation s'exécutait au moment de l'import du module (au niveau
racine, hors fonction), elle risquerait de s'exécuter pendant la collecte
des données de route par `next build`, et ferait échouer le build en
l'absence des secrets d'exécution.

## Décision

Deux mécanismes combinés :

1. `env.ts` expose un accès **paresseux** (`loadEnv()` + `Proxy` `env`) : la
   validation ne se déclenche qu'à la première lecture réelle d'une
   propriété, jamais à l'import du module.
2. `src/instrumentation.ts` (`register()`, exécuté une fois au démarrage
   d'une instance serveur — jamais pendant `next build`) appelle
   explicitement `loadEnv()` pour valider "fail fast" au boot, avec un log
   structuré de succès/échec.

## Conséquences

- Le build Docker reste inchangé (aucune nouvelle variable requise à cette
  étape).
- Une configuration invalide en production fait échouer le démarrage du
  conteneur immédiatement, avec un message explicite listant les variables
  en cause — pas une erreur tardive et confuse au premier appel API.
- Tout nouveau code serveur peut importer `env` sans se soucier du moment
  où le module est chargé.

## Alternatives écartées

- **Validation au niveau racine du module** : rejetée — casserait le build
  Docker actuel (secrets absents à l'étape `builder`).
- **Validation uniquement à la demande, sans hook de démarrage** : rejetée
  — repousserait la détection d'une configuration invalide au premier
  utilisateur touché par une requête, au lieu d'empêcher le démarrage.
