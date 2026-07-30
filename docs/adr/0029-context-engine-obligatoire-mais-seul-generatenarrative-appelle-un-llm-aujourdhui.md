# ADR 0029 — Le Context Engine est obligatoire avant tout appel IA, mais un seul point d'appel existe aujourd'hui (`generateNarrative`)

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 est catégorique : "Tous les agents devront obligatoirement
utiliser cette couche. Aucun agent ne devra gérer lui-même sa mémoire ou
son contexte." Un audit du Framework des Agents montre qu'il n'existe
aujourd'hui **qu'un seul point d'appel réel à un fournisseur IA** dans tout
le projet : `generateNarrative` (`src/lib/agents/commercial/generation.ts`),
utilisé par les 5 outils de génération de texte de l'Agent Commercial
(email, relance, proposition, estimation, recommandation). L'Agent
Director décompose ses objectifs de façon heuristique (ADR 0011, "sans IA
réelle") et l'agent de diagnostic n'appelle que des outils système —
aucun des deux n'a de point d'intégration IA à câbler.

## Décision

- `generateNarrative` **doit** systématiquement appeler `assembleContext`
  (`src/lib/context/context-engine.ts`) avant tout appel au fournisseur
  LLM actif, et injecter le texte assemblé comme message système
  additionnel s'il n'est pas vide. Sa signature impose désormais un scope
  (`organizationId`, `workspaceId`, `agentScopeId`) — les 5 call sites de
  `commercial-tools.ts` ont été mis à jour en conséquence, aucune ne peut
  contourner le Context Engine.
- Le Context Engine n'impose **aucune restriction `sourceTypes`** a priori
  dans cet appel (voir le commentaire dans `generation.ts`) : la recherche
  hybride/le classement font le tri, cohérent avec l'exigence
  "multi-sources" du brief.
- Le Workflow Engine et le Scheduler n'appellent jamais de LLM
  directement : ils invoquent des agents via `runAgentToCompletion`, qui
  finit par exécuter les mêmes outils Commercial déjà câblés — l'intégration
  est donc **transitive**, sans code supplémentaire nécessaire.
- L'Agent Director reste hors périmètre de câblage direct (aucun appel IA
  à intercepter aujourd'hui) — s'il gagne un jour une capacité de
  génération IA, ce nouveau point d'appel devra passer par
  `assembleContext` dès sa création, pas après coup.
- `assembleContext` journalise systématiquement son résultat (sections
  par nature, compression, estimation de tokens) via le logger structuré
  du projet — couvre l'exigence "Logs" de l'intégration sans modifier la
  signature de `ToolHandler`/`AgentExecutionContext`.

## Conséquences

- Un test d'intégration dédié
  (`tests/agents/context-engine-integration.test.ts`) vérifie, en
  interceptant le fournisseur LLM actif, qu'un document indexé pertinent
  apparaît bien dans les messages envoyés — et qu'aucun message de
  contexte vide n'est ajouté quand rien de pertinent n'existe.
- Le Context Engine ne peut aujourd'hui enrichir que les 5 outils de
  génération Commercial : ce n'est pas un mensonge sur la portée de
  "tous les agents", c'est un reflet honnête du fait qu'aucun autre agent
  n'appelle une IA générative dans ce projet à ce stade.
- Si un futur agent (business ou du Director) gagne une capacité
  générative, l'obligation de passer par `assembleContext` doit être
  vérifiée à la revue de code — rien dans l'architecture ne l'empêche
  techniquement de contourner cette couche si son auteur ne suit pas cette
  convention (pas de garde-fou automatique de type lint).

## Alternatives écartées

- **Imposer un point d'entrée générique unique pour tout appel LLM du
  framework** (ex. un wrapper obligatoire autour de `getActiveLlmProvider`)
  : séduisant en théorie, mais aurait nécessité de modifier
  `AgentExecutionContext`/`ToolHandler` pour tous les agents existants
  sans bénéfice réel puisqu'un seul point d'appel existe — reporté à une
  phase où plusieurs agents appelleront réellement une IA générative.
- **Ne rien câbler et se contenter d'avoir créé les quatre moteurs** :
  écartée — le brief est explicite sur le caractère obligatoire de
  l'intégration, pas seulement sur l'existence des moteurs.
