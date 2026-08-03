# ADR 0011 — Décomposition de l'objectif : heuristique de correspondance, pas de compréhension du langage naturel

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le Director doit "comprendre l'objectif" d'une demande et la "décomposer
automatiquement" en sous-tâches. Une compréhension réelle du langage
naturel nécessiterait d'intégrer un modèle de langage (LLM) — décision
explicitement écartée pour la mémoire des agents en v0.3 (ADR 0009,
"vectorisation différée, sans fournisseur externe intégré"), et cette
phase (v0.4) ne change pas cette position : aucun fournisseur IA externe
n'est intégré ici non plus.

## Décision

`src/lib/agents/director/decomposition.ts#decomposeObjective` est une
**heuristique de correspondance de mots-clés**, explicitement documentée
comme telle dans le code :

- elle liste les installations actives du workspace (hors le Director
  lui-même) ;
- elle choisit celle dont la catégorie, puis à défaut le nom, apparaît
  dans le texte de l'objectif (recherche de sous-chaîne, insensible à la
  casse) ;
- à défaut de correspondance, elle prend la première installation active
  disponible ;
- elle produit un plan à **une seule étape**, ciblant l'installation
  choisie.

Le point d'extension prévu pour une vraie décomposition (NLU/LLM) est
`directorRequestSchema.steps` (`src/lib/validations/director.ts`) : un
appelant qui fournit déjà des étapes structurées (objectif, cible,
dépendances, outils/permissions requis par étape) **court-circuite
entièrement cette heuristique** — le moteur de planification et de
délégation, eux, ne changent pas, qu'ils reçoivent un plan produit par
l'heuristique ou par un futur module de décomposition réel.

## Conséquences

- Le Director sait réellement décomposer une demande en plusieurs étapes
  **si on les lui fournit explicitement** (`steps`), avec dépendances,
  priorités, outils et permissions requis — testé de bout en bout
  (`tests/agents/director-delegation.test.ts`).
- La décomposition **automatique** (sans `steps` fourni) reste, à ce
  stade, une démonstration honnête plutôt qu'une intelligence réelle : elle
  ne gère qu'un seul agent cible par demande, et seulement par
  correspondance de mots-clés. Documenté comme limite connue dans le
  rapport de livraison.
- Remplacer cette heuristique par un vrai module de décomposition (LLM ou
  règles métier plus riches) sera un changement localisé à
  `decomposition.ts`, sans toucher `planning-engine.ts`,
  `delegation-engine.ts` ni `director-agent.ts`.

## Alternatives écartées

- **Intégrer un LLM dès maintenant pour la décomposition** : écartée —
  cohérent avec la position déjà prise en v0.3 (ADR 0009) de ne pas
  introduire de dépendance à un fournisseur IA externe tant qu'aucun agent
  métier réel n'en a un besoin prouvé. Le point d'extension
  (`directorRequestSchema.steps`) rend ce choix réversible sans
  réécriture du moteur.
- **Ne fournir aucune décomposition automatique** (exiger toujours des
  `steps` explicites) : écartée — le besoin explicite de la demande
  ("comprendre l'objectif", "décomposer automatiquement") exige une
  tentative réelle, même limitée, plutôt qu'un renvoi systématique à
  l'appelant.
