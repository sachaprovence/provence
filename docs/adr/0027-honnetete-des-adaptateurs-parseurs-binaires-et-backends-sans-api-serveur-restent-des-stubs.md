# ADR 0027 — Honnêteté des adaptateurs : parseurs binaires et backends sans API serveur restent des stubs explicites, jamais un faux succès

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 demande la compatibilité avec 19 types de sources et 8
backends vectoriels et 8 fournisseurs d'embedding. Certains sont
directement implémentables sans nouvelle dépendance (texte natif, API
REST connue) ; d'autres non : PDF/Word/Excel/PowerPoint nécessitent une
bibliothèque d'extraction absente du projet ; Facture n'a pas encore de
modèle Prisma (`MOD-12`, reporté) ; Milvus est gRPC-first ; FAISS/LanceDB
sont des bibliothèques embarquées sans API serveur générique. C'est le
même choix déjà tranché pour les outils "hors périmètre" du Framework des
Agents (v0.3, `placeholder-tools.ts`) et les actions non implémentées du
Workflow Engine (v0.6, `not-yet-implemented-actions.ts`).

## Décision

- Chaque source/backend non implémentable dans cette phase est **déclaré
  au registre** (visible, sélectionnable, listé dans les tests de
  couverture des 8/19 entrées attendues) mais lève une erreur explicite au
  moment de l'appel réel (`parse()`/`query()`/`upsert()`) — jamais un
  succès simulé ni des données inventées.
- Image/Audio/Vidéo sont traités différemment des autres stubs : le brief
  demande explicitement de "préparer l'architecture" pour ces trois-là,
  pas une extraction fonctionnelle — leur présence dans
  `KnowledgeSourceType` et le point d'extension du registre suffisent à
  remplir cette demande précise.
- Le découpage en fragments (`chunking.ts`) reste volontairement simple
  (taille fixe + recouvrement, coupe sur frontière de paragraphe/phrase
  quand possible) et sans dépendance — documenté comme limite assumée,
  pas un découpage sémantique avancé (ex. par structure de document).

## Conséquences

- Aucun risque qu'un agent reçoive un contenu tronqué ou halluciné pour
  une source qu'il croit indexée : l'échec est immédiat et explicite,
  journalisé dans `KnowledgeIndexLog` (`success: false`).
- Ajouter un vrai parseur PDF/Word/Excel/PowerPoint (ou un vrai client
  Milvus/FAISS/LanceDB) plus tard consiste à remplacer le stub par une
  implémentation réelle, sans changer sa clé ni son usage par le reste du
  pipeline (`indexing-engine.ts` ne connaît jamais la différence).
- Le compteur d'échecs du tableau de bord d'observabilité
  (`knowledge/dashboard-service.ts`) reflètera ces stubs si un appelant
  tente de les utiliser — c'est le comportement voulu, pas un bug à
  masquer.

## Alternatives écartées

- **Ajouter une dépendance d'extraction PDF/Word/Excel/PowerPoint dès
  cette phase** : écartée — le brief demande de "créer" le pipeline
  d'ingestion (l'architecture extensible), pas nécessairement de couvrir
  tous les formats binaires immédiatement ; ajouter une dépendance sans
  besoin métier validé contrevient à la convention déjà établie en v0.6.
- **Simuler un contenu extrait générique pour ces formats** : fermement
  écartée — produirait un faux contexte pour les agents, contraire au
  principe fondateur de cette version ("fournir le meilleur contexte
  possible").
