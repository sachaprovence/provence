# ADR 0034 — Condition Engine et Event Dispatcher : réutilisation directe du Workflow Engine/bus d'évènements, jamais une seconde implémentation

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief demande, pour l'Automation Engine, un "Condition Engine" (évaluation
de règles) et un "Event Dispatcher" (publication/abonnement à des
évènements). Le Workflow Engine (v0.6) possède déjà un moteur d'expressions
sûr (`workflows/expressions/evaluator.ts`, `Rule`/`Expr`, volontairement SANS
`eval`/`new Function` — voir ADR 0020) et un registre d'opérateurs
personnalisés (`workflows/conditions/registry.ts`) ; la plateforme possède
déjà un bus d'évènements générique et découplé
(`src/lib/events/domain-events.ts`, voir ADR 0018). Aucun des deux n'a de
dépendance vers `WorkflowRun` ou quoi que ce soit de spécifique au Workflow
Engine — ce sont déjà des briques génériques.

## Décision

- **`src/lib/automation/conditions/index.ts` ré-exporte** `Rule`/`Expr`/
  `VariableContext`/`evaluateRule`/`resolveExpr`/`resolveActionInput`/
  `createEmptyVariableContext`/`registerConditionOperator`/
  `getConditionOperator`/`listConditionOperatorKeys` depuis
  `workflows/expressions/`/`workflows/conditions/registry.ts` — AUCUNE
  réimplémentation. Le Retry Engine (stratégie `"conditional"`, ADR 0033)
  et le Job Executor (noeuds `condition`/`switch`/`join`, expressions de
  boucle/map) importent depuis ce point d'entrée unique de l'espace de noms
  Automation Engine, jamais directement `workflows/expressions/` — pour que
  toute migration future du moteur d'expressions n'ait qu'un seul point de
  ré-export à mettre à jour.
- **`src/lib/automation/triggers/event-dispatcher.ts` réutilise directement**
  `publishDomainEvent`/`subscribeDomainEvent`
  (`@/lib/events/domain-events.ts`) sous les noms `publishAutomationEvent`/
  `subscribeAutomationEvent` — un simple renommage sémantique pour que le
  composant "Event Dispatcher" du brief soit identifiable dans le code,
  sans dupliquer la logique de publication/abonnement (isolation des
  abonnés, jamais d'exception remontée à l'émetteur).
- **Fonction délibérément NON ré-exportée** : `renderTemplateString` (moteur
  de prompts, `agents/prompts/prompt-engine.ts`) — tentative initiale
  écartée : cette fonction appartient à un périmètre différent (templates
  de prompts LLM), pas au Condition Engine.

## Conséquences

- Un seul évaluateur d'expressions/règles existe dans tout Autorun — la
  garantie de sécurité de l'ADR 0020 (pas d'exécution de code arbitraire
  fourni par un tenant) s'applique automatiquement à l'Automation Engine
  sans travail supplémentaire.
- Un seul bus d'évènements existe — `publishAutomationEvent("lead.created",
  ...)` et un futur abonné du Workflow Engine au même évènement
  coexistent sans jamais se voir ni se bloquer mutuellement.
- Toute évolution du moteur d'expressions (nouvel opérateur, nouvelle forme
  d'`Expr`) profite immédiatement aux deux moteurs.

## Alternatives écartées

- **Dupliquer le moteur d'expressions dans `automation/`** (même schéma que
  les actions HTTP/agent/workflow, ADR 0031) : écartée ici précisément
  parce que le moteur d'expressions n'a AUCUNE dépendance vers le Workflow
  Engine (contrairement aux actions, qui ont chacune une forme de contexte
  légèrement différente) — la duplication n'aurait apporté aucun découplage
  supplémentaire, seulement un risque de divergence de comportement entre
  deux évaluateurs censés être identiques.
- **Un second bus d'évènements dédié à l'Automation Engine** : écartée pour
  la même raison — `domain-events.ts` n'a aucune dépendance métier, le
  dupliquer aurait simplement fragmenté l'observabilité des évènements
  applicatifs en deux bus distincts.
