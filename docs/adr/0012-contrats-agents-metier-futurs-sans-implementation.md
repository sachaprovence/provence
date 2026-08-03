# ADR 0012 — Contrats des agents métier futurs : types et stubs `DRAFT`, aucune implémentation

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La demande v0.4 exige de préparer l'arrivée future des agents métier
(Commercial, CRM, Marketing, Support, Analyse, Finance, Développement)
**sans les implémenter** : "Créer uniquement leurs interfaces, contrats,
capacités déclarées et points d'extension." Il faut que ce travail soit
réel (pas un simple commentaire), mais qu'aucun de ces agents ne devienne
accidentellement installable ou actif.

## Décision

Deux artefacts, aucun code métier :

1. **Contrats TypeScript** (`src/lib/agents/director/capability-contracts.ts`)
   — un type de tâche par domaine (`CommercialAgentTask`, `CrmAgentTask`,
   etc.) et un tableau `FUTURE_AGENT_CONTRACTS` documentant, pour chaque
   domaine futur : sa catégorie (`AgentDefinition.category`, ce que le
   Director utilise pour résoudre une délégation par `targetCategory`),
   les outils et permissions qu'il déclarera vraisemblablement, et la
   forme de tâche qu'il traitera.
2. **Stubs `AgentDefinition` de statut `DRAFT`** (`bootstrap.ts#syncAgentCatalog`,
   généré depuis le tableau ci-dessus) — visibles en base (donc
   consultables depuis l'admin comme "à venir"), mais **jamais
   installables** : `installAgent` (`installation-service.ts`) refuse
   désormais explicitement toute définition dont le statut n'est pas
   `PUBLISHED` (durcissement nécessaire depuis que des `DRAFT` existent
   réellement en base — avant cette phase, aucune définition `DRAFT` n'était
   jamais créée, la vérification était donc superflue).

Chaque stub référence un `runtimeKey` (`future.<catégorie>-agent`) pour
lequel **aucun `AgentRuntime` n'est enregistré** — `getAgentRuntime` y
renverrait `undefined`, sans conséquence puisque le statut `DRAFT`
empêche déjà toute installation, donc toute tentative d'exécution.

## Conséquences

- Implémenter un de ces agents plus tard consistera à : écrire un
  `AgentRuntime` réel sous la clé prévue, l'enregistrer via
  `registerAgentRuntime`, puis faire passer sa `AgentDefinition` de
  `DRAFT` à `PUBLISHED` (mise à jour de catalogue, pas une migration de
  schéma) — sans jamais retoucher le Framework des Agents ni le Director.
- Le Director peut déjà résoudre une délégation par catégorie
  (`targetCategory`) vers un de ces domaines dès qu'un agent réel y sera
  installé et actif — aucune modification du moteur de délégation ne sera
  nécessaire à ce moment-là.
- Durcissement de sécurité : `installAgent` n'accepte plus qu'une
  définition `PUBLISHED`, ce qui empêche également l'installation d'une
  définition `DEPRECATED`/`ARCHIVED` par connaissance directe de son id —
  comportement qui n'était pas garanti avant cette phase.

## Alternatives écartées

- **Ne créer que la documentation, sans lignes `AgentDefinition`** :
  écartée — la demande explicite un "catalogue" consultable, et le
  principe déjà établi en v0.3 est que le catalogue vit en base, pas
  seulement dans un fichier de documentation.
- **Enregistrer un `AgentRuntime` "non implémenté" (à la manière des outils
  `notYetImplemented`, v0.3) pour chacun** : écartée — un agent, contrairement
  à un outil, ne s'invoque jamais isolément par erreur (il faut d'abord
  l'installer) ; ajouter un runtime qui ne fait que lever une erreur
  n'aurait apporté aucune garantie supplémentaire au-delà du statut
  `DRAFT`, pour un coût de code superflu.
