# ADR 0014 — Agent Commercial : modèle de prospect générique (`CommercialProspect`), pas de réutilisation de `Lead`

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

L'Agent Commercial (v0.5) est le premier agent **métier** d'Autorun. Il a
besoin d'une fiche prospect et d'un pipeline. Provence 360 possède déjà un
modèle de données CRM riche (`Lead`, `LeadStage`, `LeadCategory`,
`Opportunity`, `Quote`) qui pourrait sembler le candidat naturel à
réutiliser — cohérent avec le principe déjà établi de ne pas dupliquer
l'infrastructure existante.

Cependant, `Lead`/`LeadCategory` sont **spécifiques au vertical
photographie 360°** de Provence 360 : `LeadCategory` énumère
`AIRBNB_HOST`, `VILLA`, `HOTEL`, `CAMPING`, `REAL_ESTATE_AGENCY`,
`RESTAURANT`, `EVENT_VENUE`, `RETAIL` — aucune notion générique de
"secteur d'activité" applicable à un agent commercial générique. La
généralisation de cette configuration métier (`MOD-02`, "Vertical Pack")
est un chantier à part entière, **reporté à chaque phase depuis v0.2**
(toujours "après la version en cours"), précisément parce qu'il s'agit
d'un effort dédié important, pas un sous-produit d'une autre fonctionnalité.

## Décision

L'Agent Commercial utilise ses **propres** modèles, `CommercialProspect`
et `CommercialAction`, scopés à une `AgentInstallation` (même principe que
`AgentMemoryEntry`/`AgentPlan`, v0.3/v0.4) — jamais `Lead`/`Opportunity`/
`Quote`. Ce choix suit exactement le précédent déjà posé par le Framework
des Agents et le Director : `AgentPlan` n'a pas réutilisé une table
métier existante pour représenter un plan d'exécution ; le Commercial ne
réutilise pas non plus une table métier existante pour représenter un
prospect générique.

Un seul modèle `CommercialAction` (avec un `type` discriminant :
`EMAIL_DRAFT`/`FOLLOW_UP`/`QUOTE_DRAFT`/`PROPOSAL`/`RECOMMENDATION`)
plutôt qu'une table par type d'action — ajouter un nouveau type d'action
est une valeur d'enum, jamais une nouvelle table, et le système
d'approbation (ADR 0017) reste uniforme quel que soit le type.

## Conséquences

- Aucune modification du schéma `Lead`/`Opportunity`/`Quote` : le golden
  path Provence 360 et toute fonctionnalité qui en dépend restent
  totalement inchangés.
- L'Agent Commercial reste réutilisable par n'importe quel futur vertical
  Autorun sans jamais avoir à connaître les catégories spécifiques de
  Provence 360.
- Deux "CRM" cohabitent dans la même base : celui de Provence 360
  (`Lead`, existant) et celui de l'Agent Commercial
  (`CommercialProspect`, nouveau). Ce n'est pas une incohérence
  accidentelle : ce sont deux couches différentes (application verticale
  historique vs. infrastructure d'agent générique), assumé explicitement
  ici pour éviter d'anticiper `MOD-02` sans l'avoir réellement traité.
- Si `MOD-02` (Vertical Pack) est un jour traité, une passerelle entre
  `CommercialProspect` et un futur modèle de prospect généralisé pourra
  être envisagée à ce moment — pas avant, pour ne pas complexifier cette
  phase avec un chantier hors périmètre.

## Alternatives écartées

- **Ajouter un `workspaceId`/des champs génériques directement sur
  `Lead`** : écartée — polluerait un modèle déjà utilisé par tout
  Provence 360 avec des champs de bookkeeping propres à l'agent
  (`scoreBreakdown`, `potentialEstimate`...), et forcerait à choisir entre
  `LeadCategory` (trop spécifique) ou son abandon (régression pour
  Provence 360).
- **Anticiper `MOD-02` maintenant** pour permettre une vraie
  généralisation : écartée — hors périmètre explicite de cette phase
  ("Agent Commercial"), risque de retarder la livraison sans bénéfice
  immédiat prouvé.
