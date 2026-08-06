# ADR 0049 — v1.6 : agents IA personnalisés, connecteurs unifiés, tableau de bord unifié, mode démo

- **Statut** : Acceptée
- **Date** : 2026-08-06
- **Portée** : décisions d'implémentation transverses à la mission « Autorun v1.6.0 — Première version réellement testable par un utilisateur » (branche `claude/autorun-architecture-design-rveiii`, base : `main`).

## Contexte

Les versions précédentes (v0.1 à v1.4) ont livré, une à une, des briques
techniques complètes et testées (Framework des Agents, Workflow Engine,
Automation Engine, intelligence documentaire, ouverture SaaS,
administration...). v1.6 change délibérément d'angle : l'objectif n'est
plus d'ajouter des fonctionnalités mais de rendre **chacune d'elles
utilisable depuis l'interface, sans écrire une seule ligne de code**, et de
livrer une installation qui fonctionne en moins de 10 minutes. Principe
directeur, comme pour v1.4 : auditer l'existant et réutiliser avant de
créer une nouvelle architecture parallèle.

## Décision — Agents IA personnalisés : une nouvelle surface UI, aucun nouveau moteur

Un agent IA personnalisé (`CustomAgent`, `CustomAgentConversation`,
`CustomAgentChatMessage`) est un **assemblage** de trois systèmes déjà
livrés, jamais une réimplémentation :

- son modèle IA vient du registre générique de fournisseurs LLM
  (`src/lib/agents/llm/`, v0.5) via `getLlmProvider(providerKey)` —
  `createCustomAgent` valide `providerKey` contre ce registre
  (`ValidationError` sinon), jamais une liste de fournisseurs dupliquée ;
- ses outils viennent du registre `ToolHandler` du Framework des Agents
  (`registerToolHandler`, ADR 0007) — `toolKeys` est validé de la même
  façon contre `listAvailableTools()` ;
- sa mémoire (si activée) passe par le Memory Engine générique
  (`src/lib/memory/memory-engine.ts`, v0.7), jamais par
  `AgentMemoryEntry` (v0.3/ADR 0009).

`CustomAgent.workspaceId` est **obligatoire**, contrairement à
`AgentDefinition.organizationId` (nullable, pour le catalogue global
d'agents du Framework) : un agent personnalisé n'existe jamais hors d'un
workspace, et rendre le champ obligatoire permet de construire un contexte
compatible `ToolHandler` sans jamais vérifier sa présence à chaque appel de
`runTool`/`sendMessage`.

**Choix explicite de ne pas réutiliser `AgentMemoryEntry`** pour la
mémoire d'un agent personnalisé : ce modèle a une contrainte de clé
étrangère stricte vers `AgentInstallation` (un agent du catalogue
installé), incompatible avec un `CustomAgent` qui n'est pas une
installation du Framework. Le Memory Engine générique, lui, a été conçu
dès v0.7 avec un `scopeId` en texte libre, sans contrainte de clé
étrangère — précisément pour rester utilisable par n'importe quel type
d'entité applicative future, dont celui-ci. `scopeType: "AGENT"`,
`scopeId: agent.id` : aucune migration de schéma nécessaire pour brancher
la mémoire des agents personnalisés.

## Décision — `registerBuiltInAgentComponents()` : rappel défensif systématique, pas une exception ponctuelle

En développant `runTool` (`custom-agent-service.ts`), l'appel d'un outil
échouait par intermittence avec « Outil introuvable ou non enregistré ».
Cause : le registre `ToolHandler` est peuplé en mémoire une seule fois, au
démarrage, par `src/instrumentation.ts` — mais `runTool` peut être invoqué
dans un contexte d'exécution qui n'a jamais exécuté ce bootstrap (déjà
documenté pour `execution-engine.ts` en ADR 0013, mais pas généralisé).
Plutôt que de traiter ce nouveau cas comme un correctif isolé, la règle est
posée explicitement ici : **tout nouveau point d'entrée qui résout un
outil ou un runtime d'agent doit rappeler
`registerBuiltInAgentComponents()` en tête de fonction** (l'enregistrement
est idempotent — un registre déjà peuplé n'est jamais recréé). Documenté
dans `DEVELOPMENT_GUIDE.md` §v1.6 pour éviter que ce piège soit redécouvert
une troisième fois.

## Décision — Connecteurs Slack/Discord : le modèle `Integration` existant, jamais une table dédiée

`IntegrationKind` gagne deux valeurs (`SLACK`, `DISCORD`) plutôt que deux
nouveaux modèles : ce sont, comme les connecteurs email/calendrier déjà en
place, une ligne `Integration` par organisation et par nature, avec
`config` (JSON, ici `{ webhookUrl }`) et `status`
(`DEMO`/`CONNECTED`/`DISCONNECTED`/`ERROR`). `connectWebhookIntegration`
réutilise la même ligne à chaque reconnexion (jamais de doublon, upsert
ciblé par `[organizationId, kind]`) — même patron que les connecteurs
existants. `testWebhookIntegration` envoie un vrai POST HTTP et limite les
essais via `isRateLimited` (`src/lib/security/rate-limiter.ts`, 5
tests/5 min), le même mécanisme déjà utilisé pour la limitation de
connexion — jamais un second limiteur de débit.

`getUnifiedConnectorsView` (nouveau) est une lecture agrégée pure : elle ne
duplique aucune donnée, elle recompose la vue déjà exposée séparément par
Gmail/Google Calendar/Stripe et les nouveaux webhooks en une seule réponse,
pour un unique écran `/connectors`.

## Décision — Tableau de bord unifié : une agrégation en lecture, jamais une nouvelle source de vérité

`getUnifiedOverview` (`src/lib/dashboards/unified-overview-service.ts`)
n'introduit aucun nouveau calcul métier : il appelle et recompose les
services de tableau de bord déjà livrés (Workflow Engine, Automation
Engine, observabilité, connecteurs, notifications) plus deux comptages
directs (agents personnalisés, entrées de mémoire) scopés par workspace.
Toute divergence entre ce tableau de bord et un tableau de bord spécialisé
existant serait donc un bug de recomposition, jamais une deuxième vérité à
réconcilier.

## Décision — Mode démo « Découvrir Autorun » : même patron d'idempotence que l'onboarding, jamais une nouvelle stratégie

`launchDemoDiscovery` (`src/lib/onboarding/demo-discovery-service.ts`)
provisionne une automatisation, un workflow (exécuté immédiatement), un
agent personnalisé (avec une première conversation) et 3 connecteurs
simulés. L'idempotence réutilise à l'identique le patron déjà posé par
l'onboarding guidé (v1.4, ADR 0047) : clé de clone déterministe
`${templateKey}-decouverte-${organizationId}`, vérification d'existence
avant création — jamais une nouvelle logique de déduplication ad hoc.
Vérifié par test dédié (rejouer `launchDemoDiscovery` deux fois ne change
aucun comptage).

**⚠️ Piège découvert pendant la validation finale** : `triggerWorkflowsForEvent`
(Workflow Engine, v0.6) scanne tous les workflows **actifs** abonnés à une
clé d'évènement donnée, sur l'ensemble de la base — il n'est pas scopé par
organisation (contrairement à la quasi-totalité du reste de l'application).
Une vérification manuelle du bouton « Découvrir Autorun » contre
l'organisation de démonstration persistante (`admin@demo.provence360.fr`)
avait laissé un workflow actif réel abonné à `"prospect.created"` — la même
clé que `tests/workflows/triggers.test.ts` — cassant ce test dès qu'il
s'exécutait, y compris en isolation totale, car la ligne restait en base
entre deux exécutions. Ce n'est pas un défaut du mode démo lui-même (son
comportement — activer un vrai workflow sur un vrai évènement global — est
exactement celui d'un usage réel), mais une conséquence du caractère
volontairement global de `triggerWorkflowsForEvent` combinée à l'usage
d'une organisation de test persistante pour une vérification manuelle.
Corrigé en supprimant la ligne laissée par ce test manuel ; la règle
generale est désormais documentée en `DEVELOPMENT_GUIDE.md` §v1.6 :
toute vérification manuelle (Playwright ad hoc, exploration UI) contre une
organisation persistante doit être nettoyée explicitement après coup,
jamais laissée en supposant qu'un `afterAll` de fixture Vitest s'en
chargera.

## Décision — Démarrage en une commande : `npm run quickstart`, jamais une nouvelle convention de scripts

`scripts/quickstart.ts` orchestre trois étapes déjà existantes séparément
(`prisma migrate deploy`, `prisma generate`, `db:seed`) puis démarre
`next dev` — il n'introduit aucune nouvelle commande de migration ou de
seed, il les enchaîne. Le seed n'est rejoué que si la base est détectée
vide (`prisma.user.count() === 0`), pour rester cohérent avec
l'idempotence déjà garantie par `db:seed` lui-même (voir README) sans
dépendre d'un flag supplémentaire. C'est désormais le chemin **principal**
documenté dans les guides utilisateur ; les commandes séparées
(`db:migrate`/`db:seed`/`dev`) restent documentées uniquement pour un
usage avancé (rejouer une seule étape).

## Conséquences

- Tout nouveau point d'entrée qui résout un outil ou un runtime d'agent
  DOIT rappeler `registerBuiltInAgentComponents()` — voir
  `DEVELOPMENT_GUIDE.md` §v1.6.
- Toute vérification manuelle d'une fonctionnalité contre une organisation
  persistante (notamment via Playwright) DOIT être suivie d'un nettoyage
  explicite des données créées, en particulier tout ce qui touche un
  déclencheur d'évènement global (`triggerWorkflowsForEvent`).
- Toute future entité applicative ayant besoin d'une mémoire doit passer
  par le Memory Engine générique (`scopeType`/`scopeId` libre), jamais par
  `AgentMemoryEntry` (réservé aux installations du Framework des Agents).
- `docs/guides/INSTALLATION.md`, `docs/guides/USER_GUIDE.md` et
  `docs/guides/FAQ.md` (nouveaux) documentent, du point de vue d'un
  utilisateur non technique, l'installation en moins de 10 minutes et
  l'usage de chaque fonctionnalité listée dans cet ADR.
