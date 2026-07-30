# ADR 0018 — Workflow Engine : graphe versionné et registres déclaratifs, découplé par un bus d'évènements

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La demande v0.6 est explicite : Autorun doit devenir "une plateforme où les
agents collaborent automatiquement grâce à un moteur de workflows
professionnel", et "aucune automatisation ne devra être codée directement
dans les modules métier". Le Workflow Engine doit donc être un module
d'infrastructure à part entière — comme le Framework des Agents (v0.3) et
l'Agent Director (v0.4) — jamais un ensemble de scripts spécifiques à un
vertical.

## Décision

- **Identité/version séparées** : `WorkflowDefinition` (identité stable,
  cycle de vie DRAFT/ACTIVE/INACTIVE/ARCHIVED) et `WorkflowVersion` (graphe
  JSON immuable une fois créé) — même séparation que `PromptTemplate`
  (v0.5), avec en plus `activeVersionId` qui pilote seul les déclenchements
  réels. Une nouvelle version ne modifie jamais une version existante.
- **Graphe purement déclaratif** : un noeud (`WorkflowNode`) ne référence
  jamais de code exécutable, seulement une clé (`triggerKey`, `actionKey`)
  résolue à l'exécution par un registre en mémoire
  (`triggers/registry.ts`, `actions/registry.ts`) — exactement le principe
  déjà établi par `AgentDefinition.runtimeKey` (ADR 0007). Le registre de
  conditions (`conditions/registry.ts`) suit le même schéma pour les
  opérateurs personnalisés (`Rule` avec `op: "custom"`).
- **Templates = `WorkflowDefinition` globaux** : `organizationId`/
  `workspaceId` nuls, `isTemplate: true`, jamais activables directement —
  un utilisateur doit d'abord les cloner dans son workspace
  (`cloneWorkflowDefinition`), même convention que les `AgentDefinition`
  globaux fournis par Autorun.
- **Découplage via un bus d'évènements générique** (`src/lib/events/
  domain-events.ts`) plutôt qu'un import direct : `agents/execution-engine.ts`
  publie `"agent_run.finished"` sans rien savoir du Workflow Engine ;
  `workflows/trigger-engine.ts` s'y abonne indépendamment pour le
  déclencheur "Exécution d'un agent". Aucune des deux couches n'importe
  l'autre à ce niveau — seule l'action `agent.call` (une couche encore
  plus haute) importe `agents/execution-engine.ts` pour déléguer une tâche,
  dans le même sens que le fait déjà `director/delegation-engine.ts`.
- **Intégration avec les agents = uniquement via l'action `agent.call`**,
  générique (cible par `installationId` ou `category`, résolution
  factorisée dans `agents/installation-service.ts#resolveActiveInstallation`,
  réutilisée aussi par le Director). Aucune action `commercial.*` dédiée
  n'a été créée : un workflow qui veut faire collaborer le Commercial
  passe par `agent.call` avec `input` respectant le contrat d'entrée que
  l'agent cible attend déjà (`{action: "full_cycle", ...}`) — zéro import
  de `commercial-service.ts` depuis le Workflow Engine.

## Conséquences

- Ajouter un nouveau déclencheur ou une nouvelle action = enregistrer une
  entrée de registre, jamais modifier `execution-engine.ts`.
- Le Workflow Engine et le Framework des Agents peuvent évoluer
  indépendamment : aucun des deux ne référence les tables internes de
  l'autre (seulement des ids opaques dans les payloads d'évènements/
  d'actions).
- Un futur agent métier (CRM, Marketing, Support...) devient immédiatement
  orchestrable par un workflow sans aucune modification du Workflow
  Engine, tant qu'il respecte le contrat `AgentRuntime` standard.

## Alternatives écartées

- **Actions dédiées par domaine métier** (`commercial.create_prospect`,
  `commercial.qualify_prospect`...) : écartées — duplique la logique de
  dispatch déjà présente dans `definitions/commercial-agent.ts` et casse
  le découplage recherché ; `agent.call` couvre le même besoin sans
  dépendance de compilation supplémentaire.
- **Import direct entre `agents/execution-engine.ts` et le Workflow
  Engine** pour le déclencheur "Exécution d'un agent" : écarté au profit
  du bus d'évènements générique, qui évite une dépendance de compilation
  dans les deux sens et reste réutilisable pour de futurs évènements
  applicatifs sans re-belle-modification du Framework.
