# ADR 0015 — Abstraction LLM générique (`LlmProvider`), distincte de l'`AIProvider` existant de Provence 360

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

L'Agent Commercial doit générer du texte (emails, relances, propositions)
via un modèle de langage, sans jamais câbler un fournisseur précis en dur,
avec des adaptateurs prévus pour OpenAI, Anthropic, Google, Mistral,
OpenRouter, Azure et Ollama. Provence 360 possède déjà une abstraction IA
(`src/lib/ai/`, interface `AIProvider`, pilotée par `AI_PROVIDER`) utilisée
par `analyzeLead`/`generateMessage`/`recommendScore`/etc.

Cette abstraction existante est délibérément **orientée tâches
métier** : ses méthodes correspondent à des opérations Provence 360
précises (`analyzeLead(input: LeadFactsInput)`, `generateMessage(input:
GenerateMessageInput)`...), avec des types d'entrée/sortie qui embarquent
directement le vocabulaire du vertical photographie 360° (`LeadFactsInput`,
`ScoreRecommendation`...). La réutiliser telle quelle pour l'Agent
Commercial forcerait soit à détourner ses méthodes de leur sens métier
d'origine, soit à les étendre avec des cas Commercial-spécifiques,
couplant deux couches qui n'ont pas vocation à l'être.

## Décision

Une nouvelle abstraction, plus bas niveau et générique,
`src/lib/agents/llm/` (`LlmProvider` : `complete(messages) -> texte`),
appartenant au **Framework des Agents** (pas à Provence 360) :

- N'importe quel agent (pas seulement le Commercial) peut s'en servir.
- Pilotée par `LLM_PROVIDER` (même convention que `AI_PROVIDER` existant),
  jamais un fournisseur choisi en dur dans le code appelant.
- Registre `Map`-based (`registry.ts`), même idiome que
  `src/lib/agents/registry.ts`/`tool-registry.ts` (v0.3).
- 7 adaptateurs réels (`providers/*.ts`) qui effectuent un vrai appel
  HTTP **si** les identifiants requis sont présents dans l'environnement,
  sinon lèvent une erreur explicite au moment de l'appel (jamais à
  l'enregistrement) — même principe que les outils `notYetImplemented`
  du Framework (v0.3).
- Un fournisseur de démonstration (`demo`, actif par défaut) déterministe,
  sans appel réseau.

Les deux abstractions (`AIProvider` et `LlmProvider`) **cohabitent
délibérément** : `src/lib/ai/` reste la couche IA de Provence 360, non
touchée par cette phase ; `src/lib/agents/llm/` est la couche IA du
Framework des Agents.

## Conséquences

- Aucune régression possible sur Provence 360 : aucun fichier de
  `src/lib/ai/` n'est modifié.
- Changer de fournisseur pour un agent ne nécessite aucune modification de
  code — seulement une variable d'environnement et les identifiants
  requis par ce fournisseur.
- Le champ `AgentDefinition.compatibleAiModels` (v0.3, jamais utilisé
  jusqu'ici) trouve enfin un usage naturel : documenter avec quels
  modèles un agent a été conçu pour fonctionner.
- Les champs structurés d'une action (sujet, montant) restent toujours
  calculés par le code appelant, jamais extraits par analyse de la
  réponse libre du modèle — plus robuste qu'un parsing fragile de sortie
  non structurée, et fonctionne aussi bien avec le fournisseur de
  démonstration qu'avec un vrai fournisseur. Une évolution naturelle
  future serait d'exploiter le mode JSON/appel d'outil natif de chaque
  fournisseur réel pour des sorties structurées fiables — hors périmètre
  de cette phase.

## Alternatives écartées

- **Étendre `AIProvider` avec les besoins du Commercial** : écartée —
  coderait en dur un couplage entre le Framework des Agents (générique,
  multi-vertical) et Provence 360 (vertical spécifique), à l'encontre du
  principe déjà établi pour tout le Framework depuis v0.3.
- **Ajouter une dépendance SDK par fournisseur (`openai`, `@anthropic-ai/sdk`, ...)** :
  écartée pour cette phase — un appel `fetch` direct suffit pour les
  formats REST de chaque fournisseur, évite d'alourdir les dépendances du
  projet pour des fournisseurs qu'aucun environnement de démonstration
  n'utilise réellement pour l'instant.
