# ADR 0013 — Enregistrement défensif des runtimes/outils : `instrumentation.ts` seul ne suffit pas en production

- **Date** : 2026-07-30
- **Statut** : accepté (correctif)

## Contexte

En validant l'Agent Director (v0.4) par un test de bout en bout réel dans
un navigateur (pas seulement `vitest`/`tsx`, qui s'exécutent dans un seul
process Node), une régression latente **déjà présente depuis v0.3** a été
découverte : `POST /api/agents/installations/[id]/runs` échouait
systématiquement avec `Runtime "system.diagnostic-agent" introuvable.`,
**y compris en `next build && next start` (production)**, alors que
`src/instrumentation.ts` avait bien loggé "Catalogue du Framework Agents
synchronisé." sans erreur au démarrage.

Cause : `registerAgentRuntime`/`registerToolHandler` (v0.3) peuplent un
`Map` au niveau module (`registry.ts`/`tool-registry.ts`). Next.js peut
charger le module qui exécute `src/instrumentation.ts#register()` (lui-même
important `bootstrap.ts` via un `import()` dynamique) dans un contexte
d'exécution distinct de celui qui charge `execution-engine.ts` pour traiter
une requête API — deux instances différentes du même fichier source,
chacune avec son propre `Map` vide côté requête. Aucun test v0.3 n'avait
exercé ce chemin par une vraie requête HTTP servie par Next.js (les tests
`vitest` appellent `registerBuiltInAgentComponents()` eux-mêmes dans
`beforeAll`, dans le même process que les assertions — masquant le
problème).

## Décision

`execution-engine.ts` (le seul consommateur de `getAgentRuntime`/
`getToolHandler`, voir ADR 0007) appelle désormais lui-même
`registerBuiltInAgentComponents()` de façon défensive, en tout début de
`executeAgentRun` :

```ts
export async function executeAgentRun(runId: string): Promise<void> {
  registerBuiltInAgentComponents();
  // ...
}
```

`registerBuiltInAgentComponents()` reste idempotente (protégée par
l'indicateur `registered`, voir `bootstrap.ts`) — cet appel est donc gratuit
(quelques `Map.set`, aucun accès base de données) sur tous les appels
suivants dans le même contexte d'exécution, et garantit que le registre est
peuplé **dans le contexte qui en a réellement besoin**, indépendamment de
ce que `instrumentation.ts` a fait ailleurs.

`src/instrumentation.ts` reste inchangé : il garde son rôle de
synchronisation du catalogue en base (`syncAgentCatalog`, qui a besoin
d'une connexion base au démarrage) et d'enregistrement "best effort" au
boot — ce n'est plus la seule garantie de disponibilité du registre.

## Conséquences

- Corrige un défaut qui affectait déjà silencieusement **tout agent
  installé en v0.3** (diagnostic compris) en production — pas seulement le
  Director. Toute route qui exécute un `AgentRun` bénéficie du correctif
  sans modification propre (`execution-engine.ts` est le point de passage
  unique).
- Validé par un test de bout en bout réel (navigateur + `next build &&
  next start`, pas seulement `vitest`) — voir le rapport de livraison v0.4.
  Recommandation retenue pour la suite : toute nouvelle fonctionnalité du
  Framework Agents doit être vérifiée au moins une fois via une vraie
  requête HTTP contre un build de production avant d'être considérée
  fiable, en plus des tests automatisés.
- Limite assumée : la cause exacte (isolation de chunk Turbopack,
  architecture de workers de Next.js 16, ou une autre spécificité du
  bundler) n'a pas été identifiée avec certitude — le correctif choisi est
  délibérément robuste à l'ignorance de cette cause précise (il ne dépend
  d'aucune hypothèse sur le fonctionnement interne du bundler).

## Alternatives écartées

- **Rendre `instrumentation.ts#register()` plus "fiable"** (retirer l'import
  dynamique, forcer une exécution plus tôt, etc.) : écartée — reposerait
  sur une hypothèse non vérifiée sur le comportement exact de Next.js/
  Turbopack d'une version à l'autre, fragile par nature. L'enregistrement
  défensif au point d'usage ne dépend d'aucune hypothèse de ce type.
- **Un registre partagé hors-process (Redis, etc.)** : très largement
  disproportionné pour stocker une poignée de références de fonctions
  JavaScript — le vrai besoin est que l'enregistrement soit exécuté dans le
  bon contexte, pas que l'état soit partagé entre process.
