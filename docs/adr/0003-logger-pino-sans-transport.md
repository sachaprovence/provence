# ADR 0003 — Logger structuré (pino) en JSON brut, sans transport `pino-pretty`

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

`src/lib/logger.ts` doit fournir une journalisation structurée pour le code
serveur, en remplacement de `console.*`. `pino-pretty` est l'option
habituelle pour un affichage lisible en développement, mais fonctionne via
un **transport** exécuté dans un worker thread séparé.

## Décision

Utiliser `pino` sans transport : sortie JSON structurée dans tous les
environnements (développement compris). Pas de `pino-pretty` intégré au
processus applicatif.

## Conséquences

- Les logs de développement sont des lignes JSON, moins agréables à l'œil
  qu'un format coloré — un développeur qui veut un affichage lisible peut
  faire `npm run dev | npx pino-pretty` localement, sans que cela fasse
  partie du code applicatif.
- Aucun risque de casse liée à l'empaquetage d'un transport (worker
  thread) par le bundler serveur de Next.js (Turbopack/webpack), qui gère
  mal ce genre de module chargé dynamiquement au runtime.
- Le format de sortie est identique en développement et en production,
  donc les habitudes de lecture des logs ne changent pas entre les deux
  environnements.

## Alternatives écartées

- **`pino` avec transport `pino-pretty` conditionné par `NODE_ENV`** :
  rejetée pour cette phase — introduit un risque d'échec silencieux ou de
  build cassé selon la façon dont Next.js empaquette le code serveur ; à
  reconsidérer plus tard si le besoin de lisibilité en développement
  devient un vrai point de friction pour l'équipe.
