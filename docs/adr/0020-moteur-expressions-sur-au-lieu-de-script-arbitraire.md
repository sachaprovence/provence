# ADR 0020 — Un moteur d'expressions sûr remplace "Exécuter un script"

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief liste "Exécuter un script" parmi les actions attendues. Autorun
est une plateforme SaaS multi-tenant : un noeud de workflow appartenant à
un workspace peut être configuré par n'importe quel utilisateur autorisé
de ce workspace, et un futur import de workflow (`POST /api/workflows/import`)
peut faire entrer un graphe conçu par un tiers. Exécuter du code arbitraire
fourni par un tenant, dans le même processus serveur que tous les autres
tenants, est une surface d'attaque inacceptable (évasion de sandbox, accès
au système de fichiers, exfiltration de secrets d'environnement, déni de
service par boucle infinie...).

## Décision

- **Aucun `eval`/`new Function`/interpréteur de langage arbitraire**
  n'est implémenté. À la place :
  - Un évaluateur d'expressions fermé (`Expr`/`Rule`,
    `src/lib/workflows/expressions/evaluator.ts`) : une expression ne peut
    être qu'une valeur littérale ou une référence de variable
    (`{{ portée.chemin }}`) ; une règle ne peut combiner que les
    opérateurs explicitement listés (comparaisons, and/or/not, regex,
    exists, in, dates, permission) plus un point d'extension contrôlé
    (`op: "custom"`, résolu via `conditions/registry.ts` — un opérateur
    personnalisé doit être enregistré par du code TypeScript déployé,
    jamais fourni dynamiquement par un tenant).
  - L'action `variable.set` (substitut sûr à "exécuter un script") : sa
    valeur d'entrée a déjà traversé la même interpolation `{{ }}` que
    n'importe quelle autre entrée d'action — elle permet de recombiner
    des variables et de faire des comparaisons/calculs simples sans jamais
    ouvrir de canal d'exécution de code.
- Cette interpolation `{{ }}` réutilise délibérément la même convention
  que le moteur de prompts (v0.5, `prompt-engine.ts`), pour que
  l'utilisateur n'ait qu'une seule syntaxe de variable à apprendre dans
  tout Autorun.

## Conséquences

- Aucun chemin d'exécution de code arbitraire n'existe dans le Workflow
  Engine, quelle que soit la façon dont un graphe a été créé (éditeur,
  import, clonage de template).
- Un besoin réel de calcul plus riche qu'une expression simple peut
  toujours être couvert en écrivant une nouvelle action de plugin
  TypeScript (déployée par l'équipe Autorun, revue de code standard) et en
  l'enregistrant — jamais en élargissant le langage d'expression accepté
  depuis l'éditeur.
- Ce choix est documenté explicitement dans le rapport de livraison plutôt
  que silencieusement substitué : "Exécuter un script" du brief est
  couvert fonctionnellement (recombiner/calculer des variables) mais pas
  littéralement (aucune exécution de code arbitraire).

## Alternatives écartées

- **Bac à sable JavaScript restreint** (ex. `vm2`, `isolated-vm`,
  QuickJS embarqué) : écarté pour cette phase — ajoute une dépendance
  externe avec son propre historique de failles d'évasion de sandbox,
  pour un besoin (calculs simples) déjà couvert par le moteur
  d'expressions. Resterait une option future si un besoin réel et borné
  se présentait, avec un budget de revue de sécurité dédié.
- **Scripts uniquement pour les administrateurs Autorun (pas les
  tenants)** : écarté — introduit une distinction de privilège
  supplémentaire à maintenir pour un gain limité, alors que l'extensibilité
  par nouvelle action enregistrée couvre déjà ce cas au niveau du code.
