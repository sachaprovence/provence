# ADR 0022 — `AutomationRule`/`automation-engine.ts` restent en l'état, non migrés vers le Workflow Engine

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Provence 360 (v0.1) possède déjà un mécanisme d'automatisation : le modèle
`AutomationRule` (déclencheur/action en chaînes libres, activable/
désactivable par organisation) et `src/lib/automation-engine.ts`, où
chaque règle métier (score élevé → tâche de validation, réponse positive →
notification, RDV pris → déplacement de pipeline, devis sans réponse →
relance, client gagné → création de mission, mission créée → suggestion de
prestataire, désinscription → blocage des envois futurs) est une fonction
dédiée appelée directement depuis les routes/services concernés. C'est
exactement le schéma que le brief v0.6 qualifie d'anti-pattern à ne plus
reproduire ("aucune automatisation ne devra être codée directement dans
les modules métier").

## Décision

- `AutomationRule`/`automation-engine.ts` ne sont **ni supprimés ni
  migrés** dans cette phase : ils continuent de fonctionner exactement
  comme avant, sans aucune modification.
- Le Workflow Engine est le chemin que **toute automatisation future**
  doit emprunter (rappelé explicitement dans les commentaires du schéma
  Prisma, section v0.6) — mais migrer les 7 règles existantes vers des
  workflows demanderait d'abord d'extraire leur logique métier
  (`Task`/`Notification`/`Lead`/`Customer`/`Mission`/`Provider`/
  `SuppressionEntry`) en services réutilisables indépendants des routes,
  ce qui est un chantier à part entière, hors périmètre de "créer le
  moteur" — voir aussi les actions `task.create`/`customer.update`/
  `appointment.create`/`quote.create` volontairement laissées comme
  stubs honnêtes (ADR implicite dans
  `actions/builtin/not-yet-implemented-actions.ts`) pour la même raison :
  aucune couche de service à appeler sans risquer de dupliquer ou de
  contourner la logique déjà en place dans les routes existantes.

## Conséquences

- Zéro risque de régression sur les automatisations Provence 360
  existantes (score, relances, missions...) — elles ne sont pas touchées.
- Le Workflow Engine et `automation-engine.ts` coexistent sciemment
  pendant une période transitoire : c'est un état de fait documenté, pas
  un oubli. Une future phase de migration devra d'abord extraire les
  fonctions d'`automation-engine.ts` en services purs, puis les exposer
  comme actions de plugin (`task.create`, `customer.update`, etc.),
  avant de pouvoir reproduire ces 7 règles comme des workflows.
- Les nouveaux modèles (`Lead`, `Quote`, `Task`...) ne sont donc pas
  encore déclenchables/actionnables nativement depuis un workflow tant que
  cette extraction n'a pas eu lieu — documenté comme limitation connue
  dans le rapport de livraison de v0.6.

## Alternatives écartées

- **Migrer immédiatement les 7 règles existantes vers des workflows** :
  écartée pour cette phase — le brief demande de "créer le moteur
  d'automatisation", pas de migrer l'existant, et une migration précipitée
  sans extraire d'abord une couche de service propre risquerait de
  dupliquer ou de contourner de la logique métier déjà correcte.
- **Supprimer `AutomationRule`/`automation-engine.ts` immédiatement** :
  écartée — casserait des automatisations Provence 360 réellement actives
  en production sans aucun remplacement fonctionnel équivalent prêt.
