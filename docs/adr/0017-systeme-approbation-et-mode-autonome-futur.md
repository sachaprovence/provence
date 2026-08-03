# ADR 0017 — Système d'approbation par défaut, architecture prête pour un mode autonome futur

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La demande est explicite et non négociable : "par défaut, aucun email,
aucun devis, aucune relance ne doit être envoyé automatiquement", tout en
"prévoyant une architecture permettant d'activer ultérieurement un mode
entièrement autonome".

## Décision

- `CommercialAction.status` est toujours créé à `PENDING_APPROVAL` par
  `createAction` (`commercial-service.ts`), quel que soit le type d'action
  (email, relance, devis, proposition, recommandation) — **sauf** si
  `AgentInstallation.config.autonomousMode === true` (champ générique
  `config: Json?` du Framework, v0.3, jamais un nouveau champ dédié), auquel
  cas l'action est créée directement `APPROVED` et marquée `autoApproved:
  true` pour rester traçable.
- **Même en mode autonome, aucune action n'atteint jamais `SENT`
  automatiquement** : l'envoi (`sendAction`) reste toujours un déclenchement
  explicite, humain aujourd'hui (`POST /api/commercial/actions/[id]/send`).
  Le mode autonome ne saute que l'étape d'approbation humaine, jamais
  l'étape d'envoi elle-même.
- `autonomousMode` est désactivé par défaut (absent de la configuration =
  `false`) : le comportement par défaut de toute nouvelle installation
  respecte l'exigence "aucune action envoyée automatiquement" sans qu'un
  opérateur n'ait à y penser.
- Le pipeline (`CommercialProspect.stage`) ne progresse vers un stade
  impliquant un envoi (`FIRST_CONTACT`, `FOLLOW_UP`, `QUOTE_SENT`) qu'au
  moment de `sendAction`, jamais à la création de l'action — le stade
  reflète toujours ce qui a réellement été envoyé, jamais ce qui a
  simplement été rédigé.

## Conséquences

- Le comportement par défaut (sans aucune configuration) satisfait
  strictement l'exigence de la demande : testé explicitement
  (`tests/agents/commercial-agent.test.ts`, `autoApproved: false` sur
  chaque action créée par défaut).
- Activer le mode autonome plus tard est un changement de configuration
  (`PATCH` sur `AgentInstallation.config`, route déjà existante depuis
  v0.3), jamais une modification de code ni du modèle de données.
- Aucun fournisseur d'envoi réel (SMTP, passerelle email) n'est câblé dans
  cette phase : `sendAction` marque l'action `SENT` et fait progresser le
  pipeline, mais ne transmet rien à un tiers — cohérent avec l'absence de
  fournisseur externe câblé en dur ailleurs dans le Framework (v0.3,
  `email.send` reste un outil non implémenté). Documenté comme limite
  explicite, pas un oubli.

## Alternatives écartées

- **Un mode autonome par type d'action** (ex. autoriser l'auto-approbation
  des relances mais pas des devis) : écartée pour cette phase — un simple
  booléen global par installation couvre l'exigence explicite
  ("architecture permettant d'activer... un mode entièrement autonome",
  pas un mode partiel) ; une granularité plus fine reste possible plus
  tard sans changement de schéma (le champ `config` est un `Json?` libre).
- **Faire de `sendAction` une conséquence automatique de l'approbation** :
  écartée — séparer explicitement "approuver" et "envoyer" donne un
  filet de sécurité supplémentaire (un humain peut approuver puis
  reconsidérer avant l'envoi effectif) et correspond mieux à un futur
  mode autonome partiel où seule l'approbation serait sautée.
