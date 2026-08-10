# ADR 0049 — Compta Vellano "Service Flow" : commandes clients, TVA configurable, navigation personnalisée

- **Date** : 2026-08-10
- **Statut** : accepté

## Contexte

Demande client directe (Compta Vellano — voir ADR 0048) : transformer l'outil,
principalement comptable jusqu'ici, en outil quotidien de service pour le
comptoir de la pizzeria (utilisé sans formation, en plein rush, y compris par
un utilisateur peu à l'aise avec l'informatique). Quatre besoins concrets :

1. Une recette de produit doit pouvoir être supprimée intégralement (état
   vide propre), pas seulement modifiée ligne par ligne.
2. Prendre une commande à table/à emporter en plusieurs étapes (ajouts,
   ajustements, changement d'avis) avant l'encaissement — jusqu'ici seule la
   vente en un seul geste (`/compta/rapide`) existait.
3. Les taux de TVA (5,5 / 10 / 20 %, parfois d'autres) sont actuellement une
   simple valeur numérique par produit — besoin d'un catalogue nommé et
   modifiable centralement.
4. Le menu latéral expose ~20 sections ; un compte "service comptoir" n'a
   besoin que de 5-6 d'entre elles en permanence visibles.

Contrainte non négociable, répétée dans la demande initiale : ne jamais
modifier une transaction historique déjà enregistrée (vente, ligne de
commande encaissée) même si le produit ou le taux de TVA associé change
ensuite. Contrainte égale : ne jamais dupliquer la logique de vente
existante (`sale-service.ts` / `createSale`).

## Décision

- **Commandes (`ComptaOrder`/`ComptaOrderLine`)** : nouveau cycle de vie
  `OPEN → COMPLETED | CANCELLED` distinct de `ComptaSale`. Chaque ligne de
  commande fige `productName`/`unitPriceTtcSnapshot`/`vatRateSnapshot` à
  l'ajout — jamais recalculée depuis le produit vivant. L'encaissement
  (`checkoutOrder`) ne réimplémente aucun calcul de vente : il construit les
  lignes à partir des snapshots déjà figés et appelle `createSale` telle
  quelle (réutilisation de `computeSaleTotals`, exportée depuis
  `sale-service.ts` plutôt que dupliquée). Protection double-clic par
  `updateMany({ where: { status: "OPEN" } })` — une seule requête UPDATE
  conditionnelle, intrinsèquement sûre sous écriture concurrente
  PostgreSQL, sans verrou applicatif superflu.
- **TVA configurable (`ComptaVatRate`)** : catalogue nommé par organisation,
  amorcé paresseusement (5,5 / 10 / 20 %) à la première consultation. Un
  produit peut pointer vers un taux (`vatRateId`) ou garder une valeur libre
  (comportement historique inchangé, rétrocompatible). Modifier le
  pourcentage d'un taux répercute la nouvelle valeur sur les produits qui y
  sont encore rattachés (source de vérité unique, jamais une valeur qui
  dérive silencieusement du catalogue) — mais ne touche **jamais**
  `ComptaSaleLine.vatRate` ni `ComptaOrderLine.vatRateSnapshot`, des copies
  structurellement indépendantes figées au moment de la vente/commande.
  L'amorçage lui-même est journalisé dans `AuditLog`
  (`compta_vat_rate.seeded`) plutôt que déduit d'un simple `count() > 0` :
  un `count()` seul ne distingue pas "jamais amorcé" de "l'organisation a
  supprimé tous ses taux volontairement", ce qui aurait réamorcé à tort.
- **Navigation personnalisée (`UserNavigationPreference`)** : stocke
  uniquement les écarts par rapport au menu par défaut du rôle
  (`sectionKey → visible`) ; l'absence de ligne = visible. Masquer une
  section est une préférence d'affichage pure — l'accès reste entièrement
  porté par `MembershipRole`, vérifié côté serveur sur chaque route,
  inchangé par ce réglage ("masqué ≠ interdit"). Deux préréglages :
  "Service pizzeria" (Tableau de bord, Compta Vellano, Vente rapide,
  Commandes, Ventes, Stock, Caisse) et "Gestion complète" (efface tous les
  écarts). `SidebarNav`/`CommandPalette` filtrent d'abord par rôle, puis par
  ces préférences.
- **Recette supprimable** : `deleteRecipe` retire toutes les
  `ComptaRecipeLine` d'un produit sans jamais toucher au produit ni à
  l'historique des ventes déjà réalisées avec cette recette.

## Conséquences

- Positif : aucune duplication de la logique de vente (une seule source de
  vérité pour le calcul TVA/remise/total, dans `sale-service.ts`) ; les
  ventes et lignes de commande historiques restent prouvablement immuables
  par construction (copies figées, jamais recalculées) plutôt que par
  discipline de code à chaque site d'appel ; le menu personnalisé ne crée
  aucune surface de risque de sécurité supplémentaire puisqu'il n'est jamais
  consulté par les vérifications de permission.
- Négatif : deux modèles de "panier" coexistent désormais
  (`ComptaOrder`/`ComptaOrderLine` pour un service en plusieurs étapes,
  `ComptaSale`/`ComptaSaleLine` pour la vente en un geste ou déjà
  encaissée) — accepté car leurs cycles de vie diffèrent réellement (une
  commande ouverte n'est pas une vente) ; les unifier aurait forcé un statut
  `OPEN` sur `ComptaSale`, qui représente aujourd'hui strictement une
  transaction déjà conclue partout ailleurs dans le code (exports, TVA
  collectée, tableau de bord).

## Alternatives écartées

- **Réutiliser `ComptaSale` avec un statut `DRAFT`/`OPEN`** pour porter les
  commandes en cours : écarté — `ComptaSale` est lu comme "transaction
  conclue" par les exports TVA, le tableau de bord et l'historique ; y
  ajouter un état transitoire aurait obligé à filtrer `status = COMPLETED`
  dans une dizaine de requêtes existantes déjà en production, pour un
  bénéfice nul par rapport à un modèle séparé.
- **Recalculer la TVA/le prix d'une ligne de commande au moment de
  l'encaissement** plutôt qu'à l'ajout : écarté — contredit directement
  l'exigence d'immutabilité ("ce que le client a vu au moment de la
  commande est ce qu'il paie"), et aurait renvoyé un total différent affiché
  pendant la prise de commande vs. facturé.
