# Autorun — Roadmap de développement

> Document de planification (toujours pas de développement lancé à partir de
> ce document seul — voir `BACKLOG.md` pour les tâches exécutables et
> `MILESTONES.md` pour le découpage en versions). Basé sur
> `docs/00-AUTORUN-VISION.md`, `docs/01-SPECIFICATION.md` et
> `docs/02-ARCHITECTURE.md`.

## 0. Principe directeur

Le MVP Provence 360 (Phase 0, déjà livré) reste **l'application de
référence toujours fonctionnelle**. Chaque étape de cette roadmap doit se
terminer avec une application qui démarre, dont le parcours
`tests/e2e/golden-path.mjs` passe toujours, et dont aucune fonctionnalité
existante n'a régressé. On généralise et on ajoute, on ne réécrit jamais à
blanc.

Convention d'identifiants utilisée dans ce document et dans `BACKLOG.md` :

- `MOD-NN` : module (ce document).
- `AR-NNNN` : tâche de backlog (`BACKLOG.md`), numérotée globalement dans
  l'ordre de la roadmap.
- `vX.Y` : version livrable (`MILESTONES.md`).

## 1. Fondations techniques indispensables

Avant tout module fonctionnel nouveau, trois éléments sont bloquants pour
la suite et doivent exister en premier (`MOD-00`, version `v0.1`) :

1. **CI** (lint + typecheck + tests unitaires + build) sur chaque PR — sans
   ça, toute généralisation ultérieure progresse sans filet.
2. **Convention ADR** (`docs/adr/`) — chaque décision structurante des
   modules suivants (ex. choix de `pg-boss` vs Redis) doit être tracée.
3. **Test d'isolation multi-tenant** générique et réutilisable — gabarit de
   test qui sera dupliqué à chaque nouveau module touchant des données
   sensibles.

Sans ces trois éléments, les modules suivants ne peuvent pas être validés de
façon fiable.

## 1 bis. Changement de plan explicite : v0.2 devient le multi-tenant, pas la configuration métier

La version `v0.2` initialement planifiée dans ce document (§3, `MOD-02` —
généralisation des catégories/catalogue/pipeline en configuration) a été
**remplacée, sur demande explicite**, par un nouveau module prioritaire :
`MOD-21` (modèle multi-tenant Organization/Workspace, isolation des
données, RBAC de workspace, audit). Raison : rendre Autorun capable
d'héberger plusieurs entreprises est un prérequis plus urgent que la
généralisation des règles métier d'un seul vertical.

Conséquence sur l'ordre : `MOD-02` (configuration métier) n'est pas
abandonné, seulement **reporté après `MOD-21`** — voir `MILESTONES.md`
pour le détail. Les décisions d'architecture prises pour `MOD-21` sont
documentées dans `docs/adr/0005` et `docs/adr/0006`.

## 1 ter. Changement de plan explicite : v0.3 devient le Framework des Agents, pas la validation du 2ᵉ vertical

De la même façon que pour v0.2, la version `v0.3` initialement envisagée
dans ce document (`MOD-20`, validation par un 2ᵉ vertical fictif) a été
**remplacée, sur demande explicite**, par un nouveau module prioritaire :
`MOD-22` (Framework des Agents IA — registre, cycle de vie, moteur
d'exécution, mémoire, communication, outils, permissions, scheduler,
observabilité, interface d'administration). Raison : Autorun doit devenir
une plateforme capable d'accueillir des agents IA spécialisés sans
modifier son architecture, ce qui est un prérequis pour tout agent métier
futur (Commercial, CRM, Marketing, etc.) — construire cette infrastructure
avant les agents eux-mêmes évite de la redéfinir a posteriori.

Conséquence sur l'ordre : `MOD-20` (validation 2ᵉ vertical) n'est pas
abandonné, seulement **reporté après `MOD-22`**. Aucun agent métier
(Commercial, CRM, Marketing, Comptabilité, Support, Analyse, Directeur)
n'est développé dans `MOD-22` : uniquement leur infrastructure commune.
Les décisions d'architecture prises pour `MOD-22` sont documentées dans
`docs/adr/0007`, `docs/adr/0008` et `docs/adr/0009`.

## 2. Vue d'ensemble des modules

| ID | Module | État actuel | Priorité |
|---|---|---|---|
| MOD-00 | Fondations techniques & DevOps | ✅ Livré (v0.1) | Critique |
| MOD-01 | Identité & Accès | Existant (Phase 0), étendu multi-tenant (v0.2) | Haute (généralisation) |
| MOD-02 | Configuration métier / Vertical Pack | Reporté à v0.3 (voir §0 bis) | Critique |
| MOD-21 | Multi-tenant Organization/Workspace | ✅ Livré (v0.2) | Critique |
| MOD-03 | CRM Prospects | Existant (Phase 0) | Haute (généralisation) |
| MOD-04 | Analyse & Scoring IA | Existant (Phase 0) | Haute (généralisation + réel) |
| MOD-05 | Campagnes & Séquences | Existant (Phase 0) | Moyenne (généralisation) |
| MOD-06 | Communication (email) | Existant (Phase 0) | Haute (connecteurs réels) |
| MOD-07 | Suivi commercial | Existant (Phase 0) | Basse (déjà générique) |
| MOD-08 | Exécution / Production | Existant (Phase 0) | Basse (déjà générique) |
| MOD-09 | Automatisation | Existant (Phase 0) | Moyenne (généralisation) |
| MOD-10 | Conformité & Audit | Existant (Phase 0) | Haute (extension RGPD) |
| MOD-11 | Statistiques & Dashboard | Existant (Phase 0) | Basse (généralisation) |
| MOD-12 | Facturation client final | À créer | Haute |
| MOD-13 | Gestion documentaire | À créer | Moyenne |
| MOD-14 | Calendrier | À créer | Moyenne |
| MOD-15 | Infrastructure asynchrone (jobs) | À créer | Haute |
| MOD-16 | Observabilité | À créer | Haute |
| MOD-17 | Sécurité avancée & conformité renforcée | À créer | Critique (avant SaaS public) |
| MOD-18 | Intégrations tierces & API publique | À créer | Moyenne |
| MOD-19 | Facturation SaaS Autorun (abonnements) | À créer | Haute (condition de v1.0) |
| MOD-20 | Vertical Pack — validation par un 2ᵉ vertical fictif | Reporté à v0.4 (voir §1 ter) | Critique (preuve du concept) |
| MOD-22 | Framework des Agents IA | ✅ Livré (v0.3) | Critique |

## 3. Détail par module

Pour chaque module : objectif, fonctionnalités, dépendances, priorité,
risques techniques, choix d'architecture, tests à prévoir, critères de fin
(Definition of Done).

---

### MOD-00 — Fondations techniques & DevOps

- **Objectif** : donner à tous les modules suivants un socle CI/CD, de
  conventions et de gabarits de test, sans lequel toute généralisation est
  invérifiable.
- **Fonctionnalités** : pipeline CI (lint, typecheck, tests, build) sur
  chaque PR ; pipeline e2e sur merge vers `main` ; dossier `docs/adr/` avec
  premier ADR (choix déjà pris : monolithe modulaire, pg-boss avant Redis) ;
  gabarit de test d'isolation multi-tenant réutilisable ; `CODEOWNERS`
  minimal.
- **Dépendances** : aucune (premier module).
- **Priorité** : Critique.
- **Risques techniques** : sur-outiller trop tôt (pipeline trop complexe
  pour la taille actuelle de l'équipe) — mitigation : rester sur GitHub
  Actions simple, pas de matrice multi-environnement avant d'en avoir
  besoin.
- **Choix d'architecture** : CI GitHub Actions (déjà l'hébergeur du dépôt) ;
  pas d'auto-déploiement en production tant que `MOD-16` (observabilité)
  n'existe pas.
- **Tests à prévoir** : le pipeline lui-même est le test (« la CI passe » ==
  critère) ; test de fumée qui vérifie que `npm run build` réussit sur une
  base de données vide fraîchement migrée.
- **Critères de fin** : une PR de test délibérément cassée (lint qui échoue)
  est bien bloquée par la CI ; le gabarit de test d'isolation tourne et
  passe sur le module `MOD-01` existant.

---

### MOD-01 — Identité & Accès

- **Objectif** : généraliser l'authentification/RBAC actuels pour qu'ils
  restent valables quel que soit le vertical métier, et préparer
  l'extensibilité vers SSO/2FA (`MOD-17`) sans la construire tout de suite.
- **Fonctionnalités (existantes)** : inscription (création d'organisation),
  connexion, reset mot de passe, sessions, rôles (`OWNER_ADMIN`, `SALES`,
  `PROVIDER`), territoires, journal de connexion.
- **Fonctionnalités à généraliser** : rendre les libellés de rôle
  configurables par vertical à terme (`MOD-02`) sans changer les valeurs
  techniques d'enum (`MembershipRole` reste un enum technique stable, seul
  le libellé affiché change).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute (généralisation légère, pas de refonte).
- **Risques techniques** : casser une session existante en modifiant la
  table `Session`/cookie — mitigation : aucune migration destructive sur ce
  module avant `MOD-17`.
- **Choix d'architecture** : conserver les sessions maison (pas de
  bibliothèque tierce type Auth.js) tant que le SSO n'est pas requis
  (`MOD-17`, phase entreprise) — cohérent avec « pas de dépendance imposée
  avant le besoin réel ».
- **Tests à prévoir** : tests d'isolation multi-tenant (gabarit `MOD-00`)
  appliqués à toutes les routes `api/users`, `api/settings/organization`.
- **Critères de fin** : aucune route d'authentification/permission modifiée
  sans test de régression associé ; libellés de rôle lisibles depuis la
  config vertical dans l'UI (préparation `MOD-02`).

---

### MOD-02 — Configuration métier / Vertical Pack (modèle de données)

- **Objectif** : sortir ce qui est aujourd'hui codé en dur pour Provence 360
  (`LeadCategory`, `ServiceKind`, les 15 valeurs fixes de `LeadStage`) d'un
  enum Prisma global vers des données de configuration **par
  organisation**, sans changer le comportement observable du MVP actuel.
- **Fonctionnalités** : table `PipelineStageDefinition` (ordre, libellé,
  couleur, organisation ou vertical par défaut) ; table
  `LeadCategoryDefinition` ; table `ServiceCatalogDefinition` ; script de
  migration qui recrée pour Provence 360 exactement les valeurs actuelles
  (aucune régression visible) ; UI d'administration pour éditer ces
  définitions (déjà amorcée par `services-manager.tsx`,
  `territories-manager.tsx`, à étendre).
- **Dépendances** : `MOD-00`, `MOD-01`.
- **Priorité** : Critique — module bloquant pour tout le reste de la
  généralisation.
- **Risques techniques** : c'est le module le plus risqué de toute la
  roadmap (migration de données sur une table centrale, `Lead`). Mitigation :
  migration en deux temps — 1) ajouter les nouvelles tables + colonnes en
  parallèle des enums existants, sans rien retirer ; 2) basculer la
  lecture/écriture applicative ; 3) retirer les enums seulement après
  validation complète par les tests + `MOD-20`.
- **Choix d'architecture** : les enums **techniques** (statuts :
  `MessageStatus`, `QuoteStatus`, `MissionStatus`...) restent des enums
  Prisma — seuls les enums **métier** (qui varient par activité) migrent
  vers des tables de configuration.
- **Tests à prévoir** : test de non-régression complet du golden path
  Provence 360 après migration ; test qui vérifie qu'une organisation sans
  configuration explicite reçoit un jeu de valeurs par défaut cohérent
  (vertical « generic »).
- **Critères de fin** : `tests/e2e/golden-path.mjs` passe sans modification ;
  les valeurs affichées pour Provence 360 sont identiques avant/après ; une
  organisation de test peut définir des catégories différentes de Provence
  360 sans toucher au code.

---

### MOD-03 — CRM Prospects

- **Objectif** : généraliser le CRM prospects pour qu'il reste pertinent
  hors du contexte "visite virtuelle 3D" (champs spécifiques déjà
  correctement optionnels : `hasVirtualTour`, `reviewCount`...).
- **Fonctionnalités (existantes)** : `Lead`, `LeadContact`, `LeadNote`,
  `Tag`, `IdealCustomerProfile`, import CSV avec mapping/dédoublonnage.
- **Fonctionnalités à ajouter** : champs personnalisés par vertical (au
  minimum un champ `customFields: Json` déjà envisageable sans migration
  lourde) pour éviter d'ajouter une colonne Prisma à chaque nouveau
  vertical.
- **Dépendances** : `MOD-02`.
- **Priorité** : Haute.
- **Risques techniques** : sur-généraliser en `Json` libre au point de
  perdre la validation Zod — mitigation : schéma Zod dynamique généré à
  partir de la définition de champs personnalisés du vertical, jamais de
  champ non validé.
- **Choix d'architecture** : rester sur une table `Lead` unique et large
  plutôt que de la scinder par vertical (cohérent avec l'objectif « un seul
  pipeline »).
- **Tests à prévoir** : validation Zod des champs personnalisés ; test
  d'import CSV avec un mapping de colonnes différent de celui de Provence
  360.
- **Critères de fin** : un import CSV avec des colonnes non prévues à
  l'origine (propres à un autre métier) fonctionne sans modification de
  code, seulement de configuration.

---

### MOD-04 — Analyse & Scoring IA

- **Objectif** : passer de l'`AIProvider` démo à un fournisseur réel
  (Anthropic), tout en généralisant les prompts pour qu'ils s'appuient sur
  la configuration vertical (`MOD-02`) plutôt que sur du texte figé pour
  Provence 360.
- **Fonctionnalités (existantes)** : `analyzeLead`, `recommendScore`,
  `generateMessage`, `classifyReply`, `summarizeConversation`,
  `recommendNextAction`, `translate`, `generateSalesReport`,
  `estimateCostUsd`, journalisation `AIRequest`.
- **Fonctionnalités à ajouter** : implémentation `AnthropicAIProvider` ;
  gabarits de prompt paramétrés par vertical (ton, catalogue de services,
  pitch d'organisation déjà en base) ; plafond de coût dur par organisation
  (quota, pas seulement journalisation).
- **Dépendances** : `MOD-02` (prompts génériques), `MOD-15` (les appels IA
  réels doivent passer en tâche asynchrone, pas en synchrone bloquant une
  requête HTTP).
- **Priorité** : Haute.
- **Risques techniques** : dérive de coût si un vrai fournisseur est
  branché sans quota dur — mitigation : quota bloquant avant tout
  branchement réel, jamais l'inverse.
- **Choix d'architecture** : clé API strictement côté serveur ; aucun appel
  direct au SDK Anthropic hors de `src/lib/ai/anthropic-provider.ts` ;
  variable d'environnement `AI_PROVIDER=anthropic`.
- **Tests à prévoir** : tests de contrat (« étant donné cette interface
  `AIProvider`, n'importe quelle implémentation doit satisfaire ces
  invariants ») indépendants de l'implémentation ; test de dépassement de
  quota (doit bloquer, pas juste logguer).
- **Critères de fin** : bascule `AI_PROVIDER=demo` → `AI_PROVIDER=anthropic`
  sans changement de code applicatif ; quota dur vérifié par test.

---

### MOD-05 — Campagnes & Séquences

- **Objectif** : généraliser le moteur de séquences pour qu'il ne présuppose
  pas un cycle de vente "prospection immobilière/tourisme" mais reste
  paramétrable par vertical (gabarits de message).
- **Fonctionnalités (existantes)** : `Campaign`, `Sequence`,
  `SequenceStep`, `Enrollment`, moteur `sequence-engine.ts` (fenêtres
  horaires, arrêt automatique).
- **Fonctionnalités à ajouter** : gabarits de message (`templateKey`)
  résolus depuis la configuration vertical plutôt que codés en dur.
- **Dépendances** : `MOD-02`, `MOD-04`.
- **Priorité** : Moyenne.
- **Risques techniques** : régression du comportement d'arrêt automatique
  pendant la généralisation — mitigation : ce module ne touche pas à la
  logique de `stopEnrollmentsForLead`, seulement à la résolution des
  gabarits.
- **Choix d'architecture** : le moteur reste synchrone-déclenché par cron
  jusqu'à `MOD-15` ; ne pas migrer ce module vers la file de jobs avant que
  celle-ci existe (éviter le travail en double).
- **Tests à prévoir** : test de non-régression sur les fenêtres
  horaires/jours autorisés ; test qu'un gabarit inconnu pour un vertical
  donné échoue explicitement (pas de silencieux fallback vers Provence
  360).
- **Critères de fin** : une séquence configurée pour un vertical fictif de
  test (`MOD-20`) s'exécute correctement.

---

### MOD-06 — Communication (email)

- **Objectif** : ajouter de vraies implémentations `EmailProvider` (SMTP
  générique, puis Gmail/Outlook API) en plus du provider démo.
- **Fonctionnalités (existantes)** : `EmailAccount`, `Message`,
  `EmailEvent`, `Conversation`, provider démo.
- **Fonctionnalités à ajouter** : `SmtpEmailProvider` ; `GmailApiProvider` ;
  `OutlookApiProvider` ; gestion des rebonds/erreurs réelles (au-delà de la
  simulation actuelle par mot-clé `invalid`/`bounce`).
- **Dépendances** : `MOD-15` (envoi réel doit passer par la file de jobs,
  pas en synchrone), `MOD-16` (observabilité des échecs d'envoi).
- **Priorité** : Haute (nécessaire dès qu'on sort du cadre interne
  Provence 360).
- **Risques techniques** : gestion des quotas d'envoi réels et de la
  réputation d'expéditeur (SPF/DKIM/DMARC) — hors du contrôle applicatif
  pur ; mitigation : documenter les prérequis DNS dans le guide de
  déploiement, pas de solution "magique" côté code.
- **Choix d'architecture** : chaque implémentation dans un fichier dédié
  sous `src/lib/email/`, sélection par `EMAIL_PROVIDER`, jamais de logique
  spécifique fournisseur dans `sequence-engine.ts`.
- **Tests à prévoir** : tests de contrat `EmailProvider` communs à toutes
  les implémentations ; test manuel documenté (pas automatisable) pour
  vérifier la délivrabilité réelle en environnement de préproduction.
- **Critères de fin** : envoi réel via SMTP testé de bout en bout sur un
  compte de test ; bascule de provider par variable d'environnement sans
  changement de code.

---

### MOD-07 — Suivi commercial

- **Objectif** : ce module (`Task`, `Appointment`, `Opportunity`, `Quote`,
  `Service`) est déjà largement générique — le travail consiste surtout à
  le relier à `MOD-02` (catalogue de services configurable) et
  `MOD-12` (devis → facture).
- **Fonctionnalités (existantes)** : gestion complète tâches/RDV/
  opportunités/devis avec lignes de devis liées à `Service`.
- **Fonctionnalités à ajouter** : lien `Quote` → `Invoice` (préparation
  `MOD-12`).
- **Dépendances** : `MOD-02`.
- **Priorité** : Basse (peu de travail requis).
- **Risques techniques** : faibles — module déjà bien conçu.
- **Choix d'architecture** : aucun changement structurant, seulement des
  champs de liaison additifs.
- **Tests à prévoir** : test de génération d'un devis accepté déclenchant
  la préparation d'une facture (sans implémenter la facture elle-même
  avant `MOD-12`).
- **Critères de fin** : un `Quote` avec statut `ACCEPTED` référence un point
  d'extension clair pour `MOD-12` (pas de facture encore créée à ce stade).

---

### MOD-08 — Exécution / Production

- **Objectif** : ce module (`Customer`, `Mission`, `Provider`, `Territory`)
  est déjà générique (une "mission" n'est pas spécifique aux visites
  virtuelles). Aucun travail de généralisation majeur requis.
- **Fonctionnalités (existantes)** : création automatique de mission à la
  victoire d'une opportunité, attribution de prestataire par territoire.
- **Dépendances** : `MOD-02` (si le vertical définit des types de mission
  différents).
- **Priorité** : Basse.
- **Risques techniques** : aucun identifié.
- **Choix d'architecture** : aucun changement.
- **Tests à prévoir** : test de non-régression uniquement.
- **Critères de fin** : aucun changement de comportement requis pour ce
  module avant la phase SaaS (`MOD-19`).

---

### MOD-09 — Automatisation

- **Objectif** : généraliser le moteur de règles internes
  (`automation-engine.ts`) pour accepter des déclencheurs/actions définis
  par vertical, au-delà des 7 règles actuelles codées pour Provence 360.
- **Fonctionnalités (existantes)** : `AutomationRule` (déclencheur → action)
  avec 7 règles par défaut.
- **Fonctionnalités à ajouter** : registre de types de déclencheur/action
  extensible (pattern déjà proche : `triggerType`/`triggerConfig` en
  `Json`) ; validation Zod des configurations par type.
- **Dépendances** : `MOD-02`, `MOD-05`.
- **Priorité** : Moyenne.
- **Risques techniques** : une règle mal validée qui déclenche une action en
  boucle (ex. règle qui se déclenche elle-même) — mitigation : détection de
  cycle simple + limite de nombre d'exécutions par règle par jour.
- **Choix d'architecture** : garder un moteur de règles simple (pas de
  workflow visuel complet, reporté à `MOD-18`+).
- **Tests à prévoir** : test de détection de boucle ; test des 7 règles
  existantes en non-régression.
- **Critères de fin** : ajout d'une règle pour le vertical fictif de test
  (`MOD-20`) sans modification du moteur.

---

### MOD-10 — Conformité & Audit

- **Objectif** : étendre les fondations RGPD déjà solides
  (`SuppressionEntry`, `ConsentRecord`, `AuditLog`) avec le droit à l'oubli
  et l'export de données, prérequis avant toute ouverture SaaS publique.
- **Fonctionnalités (existantes)** : liste d'exclusion, consentement,
  journal d'audit immuable.
- **Fonctionnalités à ajouter** : export de toutes les données d'un
  prospect/client sur demande ; anonymisation/suppression définitive d'un
  prospect sur demande (droit à l'oubli), en conservant l'audit log requis
  légalement.
- **Dépendances** : `MOD-01`.
- **Priorité** : Haute.
- **Risques techniques** : conflit entre "droit à l'oubli" et "audit log
  immuable" — mitigation : anonymiser les champs identifiants dans
  `AuditLog` plutôt que supprimer les lignes.
- **Choix d'architecture** : fonction unique `forgetLead(leadId)`
  centralisée, jamais de suppression ad hoc dispersée dans le code.
- **Tests à prévoir** : test qu'après `forgetLead`, aucune donnée
  identifiante ne subsiste, mais que les compteurs statistiques agrégés
  restent cohérents.
- **Critères de fin** : demande de droit à l'oubli traitée de bout en bout
  et vérifiée par test automatisé.

---

### MOD-11 — Statistiques & Dashboard

- **Objectif** : généraliser `stats.ts` et les pages dashboard pour qu'elles
  restent pertinentes quel que soit le catalogue de services/catégories
  d'un vertical.
- **Fonctionnalités (existantes)** : compteurs, taux, filtres
  période/ville/catégorie/campagne/commercial.
- **Fonctionnalités à ajouter** : filtres dynamiques basés sur les
  catégories/services définis par `MOD-02` plutôt que sur les enums fixes.
- **Dépendances** : `MOD-02`.
- **Priorité** : Basse.
- **Risques techniques** : requêtes de statistiques qui deviennent plus
  coûteuses si elles doivent joindre des tables de configuration — mitigation
  : dénormalisation légère si besoin (mesurer avant d'optimiser).
- **Choix d'architecture** : conserver Recharts, pas de nouvelle
  dépendance de visualisation.
- **Tests à prévoir** : test de cohérence des agrégats après migration
  `MOD-02`.
- **Critères de fin** : dashboard fonctionnel pour le vertical fictif de
  test sans code spécifique.

---

### MOD-12 — Facturation client final

- **Objectif** : ajouter le module absent du cahier des charges initial —
  transformer un devis accepté en facture, suivre le paiement.
- **Fonctionnalités** : `Invoice` (référence, lignes, montant, statut :
  `DRAFT`/`SENT`/`PAID`/`OVERDUE`/`CANCELLED`), génération depuis un `Quote`
  accepté, relance automatique d'impayé (réutilise `MOD-09`), export
  PDF simple.
- **Fonctionnalités (étape suivante, v0.5)** : intégration Stripe pour le
  paiement en ligne réel (lien de paiement, webhook de confirmation).
- **Dépendances** : `MOD-07`, `MOD-10` (audit des transactions
  financières), `MOD-15` (webhooks Stripe traités de façon asynchrone et
  idempotente).
- **Priorité** : Haute.
- **Risques techniques** : gestion de la double-écriture (webhook Stripe
  reçu deux fois) — mitigation : idempotence stricte par clé d'événement
  Stripe, déjà le pattern utilisé par `WebhookEvent` existant.
- **Choix d'architecture** : ne jamais stocker de données de carte
  bancaire directement — tout passe par Stripe (tokenisation), conforme à
  la contrainte de sécurité §10 de la vision.
- **Tests à prévoir** : test de génération de facture depuis un devis ;
  test d'idempotence de traitement de webhook (même événement reçu deux
  fois → un seul effet) ; test de non-stockage de données bancaires.
- **Critères de fin** : un devis accepté peut être transformé en facture,
  envoyée, marquée payée (manuellement en v0.4, via Stripe en v0.5), avec
  audit complet.

---

### MOD-13 — Gestion documentaire

- **Objectif** : permettre le stockage et l'association de fichiers
  (contrats, livrables, pièces jointes) aux prospects/clients/missions.
- **Fonctionnalités** : interface `StorageProvider` (upload, download,
  suppression, URL signée temporaire) ; implémentation `LocalStorageProvider`
  (démo/self-host) et `S3StorageProvider` ; modèle `Document` (nom, type,
  taille, propriétaire polymorphe : lead/customer/mission).
- **Dépendances** : `MOD-01` (permissions d'accès aux documents),
  `MOD-10` (audit des accès aux documents sensibles).
- **Priorité** : Moyenne.
- **Risques techniques** : fuite d'accès à un document d'une autre
  organisation via une URL devinée — mitigation : URLs signées à expiration
  courte, jamais d'URL publique permanente par défaut.
- **Choix d'architecture** : interface `StorageProvider` suivant exactement
  le même pattern que `AIProvider`/`EmailProvider` (cohérence
  architecturale déjà établie).
- **Tests à prévoir** : test qu'une URL signée expirée est refusée ; test
  d'isolation multi-tenant sur l'accès aux documents.
- **Critères de fin** : upload/téléchargement/suppression fonctionnels en
  local (`LocalStorageProvider`) sans dépendance payante, bascule S3 par
  configuration.

---

### MOD-14 — Calendrier

- **Objectif** : offrir une vraie vue calendrier (au-delà de la liste de
  rendez-vous actuelle) et, en option, une synchronisation externe.
- **Fonctionnalités** : vue calendrier (jour/semaine/mois) sur
  `Appointment` existant ; interface `CalendarProvider` ; synchronisation
  Google Calendar / Outlook Calendar (lecture + écriture bidirectionnelle).
- **Dépendances** : `MOD-07` (Appointment existant), `MOD-15` (synchronisation
  périodique en tâche de fond).
- **Priorité** : Moyenne.
- **Risques techniques** : conflits de synchronisation bidirectionnelle
  (RDV modifié des deux côtés) — mitigation : stratégie "dernière
  écriture gagne" documentée explicitement en v1, résolution de conflit
  plus fine reportée en fonctionnalité future.
- **Choix d'architecture** : la vue calendrier interne fonctionne sans
  aucune intégration externe (mode démo) ; la synchronisation est une
  option additive.
- **Tests à prévoir** : test de la vue calendrier sans intégration externe ;
  test de contrat `CalendarProvider` indépendant de Google/Outlook.
- **Critères de fin** : vue calendrier utilisable sans clé API externe ;
  synchronisation Google testée sur un compte de test.

---

### MOD-15 — Infrastructure asynchrone (jobs)

- **Objectif** : sortir le traitement des séquences, des appels IA lourds,
  des imports volumineux et des webhooks du cycle requête/réponse HTTP.
- **Fonctionnalités** : intégration `pg-boss` (file de jobs sur
  PostgreSQL, pas de nouvelle brique d'infra) ; jobs :
  `process-sequences`, `send-email`, `run-ai-request`, `import-csv-large`,
  `sync-calendar`, `process-stripe-webhook` ; tableau de bord basique des
  jobs en échec (retry, dead-letter).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute — prérequis de `MOD-04`, `MOD-06`, `MOD-12`,
  `MOD-14`.
- **Risques techniques** : migration de logique synchrone existante
  (`processDueSequences`) vers asynchrone sans changer le comportement
  observable — mitigation : encapsuler d'abord la fonction existante
  telle quelle dans un job, sans la réécrire, puis optimiser ensuite si
  besoin.
- **Choix d'architecture** : `pg-boss` choisi explicitement plutôt que
  Redis/BullMQ pour cette étape (pas de nouvelle brique d'infra tant que le
  volume ne l'exige pas) — à documenter en ADR ; migration vers
  Redis/BullMQ reportée en optimisation future si le volume l'impose.
- **Tests à prévoir** : test qu'un job échoué est retenté puis mis en
  dead-letter après N tentatives ; test de non-régression du comportement
  des séquences après migration en job.
- **Critères de fin** : `POST /api/cron/process-sequences` devient un
  déclencheur de job (ou est remplacé par un scheduler interne à
  `pg-boss`), avec le même comportement observable qu'avant.

---

### MOD-16 — Observabilité

- **Objectif** : donner de la visibilité sur les erreurs et la performance
  avant toute ouverture à plusieurs organisations externes.
- **Fonctionnalités** : logs structurés (pino) remplaçant les
  `console.log` ; capture d'erreurs (Sentry ou équivalent) ; métriques de
  base (latence API, taux d'échec d'envoi email, coût IA cumulé) ;
  dashboard opérationnel minimal (au moins des logs consultables, pas
  nécessairement Grafana dès cette étape).
- **Dépendances** : `MOD-00`.
- **Priorité** : Haute.
- **Risques techniques** : fuite de données sensibles dans les logs
  (contenu d'email, prompt IA) — mitigation : politique de journalisation
  explicite (liste blanche de champs loggables), revue dédiée.
- **Choix d'architecture** : logs structurés dès ce module, pas de
  `console.log` toléré ensuite (règle ESLint dédiée).
- **Tests à prévoir** : test qu'aucune donnée sensible identifiée (mot de
  passe, token) n'apparaît dans un log ; test de capture d'une exception
  simulée par Sentry en environnement de test.
- **Critères de fin** : une erreur applicative simulée est visible dans
  l'outil de capture choisi avec assez de contexte pour être diagnostiquée
  sans accès direct au serveur.

---

### MOD-17 — Sécurité avancée & conformité renforcée

- **Objectif** : durcir l'isolation multi-tenant et la sécurité générale
  avant toute ouverture SaaS publique (`MOD-19`).
- **Fonctionnalités** : suite systématique de tests d'isolation
  multi-tenant sur *toutes* les routes API (généralisation du gabarit
  `MOD-00`) ; revue de sécurité type OWASP Top 10 ; quotas IA/email durs
  par organisation (au-delà du plafond de coût de `MOD-04`) ; préparation
  (pas obligatoirement l'implémentation complète) de 2FA/SSO pour les
  comptes entreprise.
- **Dépendances** : `MOD-01`, `MOD-04`, `MOD-06`, `MOD-16`.
- **Priorité** : Critique (condition bloquante avant `MOD-19`).
- **Risques techniques** : découvrir une fuite d'isolation tardivement,
  après ouverture publique — mitigation : ce module est explicitement une
  porte de sortie obligatoire (gate) avant `MOD-19`, pas une tâche
  optionnelle.
- **Choix d'architecture** : centraliser tout contrôle d'accès dans
  `src/lib/permissions.ts` (déjà le cas) ; interdire par convention toute
  requête Prisma sans filtre `organizationId` explicite en dehors de ce
  fichier (vérifiable par revue de code, éventuellement règle de lint
  personnalisée plus tard).
- **Tests à prévoir** : suite de tests d'isolation exhaustive (une entrée
  par route API) ; test de charge basique pour vérifier qu'un quota
  bloque effectivement au bon seuil.
- **Critères de fin** : 100 % des routes API couvertes par un test
  d'isolation multi-tenant ; rapport de revue de sécurité sans
  vulnérabilité critique ouverte.

---

### MOD-18 — Intégrations tierces & API publique

- **Objectif** : ouvrir Autorun à des intégrations externes (comptabilité,
  signature électronique, visioconférence) et à des développeurs tiers.
- **Fonctionnalités** : API publique documentée (a minima REST, OpenAPI) en
  lecture puis écriture progressive ; webhooks sortants (événements :
  prospect créé, devis accepté, facture payée...) ; premiers connecteurs
  recommandés (voir §6).
- **Dépendances** : `MOD-15` (livraison fiable des webhooks sortants avec
  retry), `MOD-17` (sécurité de l'API publique : clés API, rate limiting).
- **Priorité** : Moyenne (nécessaire pour `MOD-19` mais pas bloquante pour
  un premier stable interne).
- **Risques techniques** : surface d'attaque élargie par l'API publique —
  mitigation : clés API scopées par organisation, rate limiting dès le
  premier déploiement, jamais après coup.
- **Choix d'architecture** : versionner l'API dès la première route
  publique (`/api/public/v1/...`) pour permettre une évolution sans
  rupture ultérieure.
- **Tests à prévoir** : test de rate limiting ; test qu'une clé API d'une
  organisation ne peut accéder qu'à ses propres données.
- **Critères de fin** : au moins un connecteur tiers réel fonctionnel de
  bout en bout (webhook sortant consommé par un service externe de test).

---

### MOD-19 — Facturation SaaS Autorun (abonnements)

- **Objectif** : permettre à Autorun (l'éditeur) de facturer ses propres
  clients par abonnement, condition de l'ouverture SaaS self-service.
- **Fonctionnalités** : plans (Starter/Pro/Entreprise), Stripe Billing pour
  l'abonnement récurrent, quotas par plan (nombre d'utilisateurs, volume
  IA/email), onboarding self-service (création d'organisation sans
  intervention manuelle), page de gestion d'abonnement.
- **Dépendances** : `MOD-12` (Stripe déjà intégré côté facturation client
  final, réutilisé côté abonnement), `MOD-17` (sécurité avant ouverture
  publique), `MOD-01`.
- **Priorité** : Haute — condition de la version stable `v1.0`.
- **Risques techniques** : incohérence entre quota de plan et quota IA
  technique (`MOD-04`/`MOD-17`) si les deux mécanismes divergent —
  mitigation : un seul mécanisme de quota, paramétré par le plan, pas deux
  systèmes parallèles.
- **Choix d'architecture** : Stripe Billing plutôt qu'un moteur de
  facturation maison (ne pas réinventer la gestion de cycles de
  facturation, taxes, relances d'échec de paiement).
- **Tests à prévoir** : test de changement de plan (upgrade/downgrade) et
  d'application immédiate des nouveaux quotas ; test d'échec de paiement
  d'abonnement (passage en statut restreint, pas de suppression de
  données).
- **Critères de fin** : une organisation peut s'inscrire, choisir un plan,
  payer, et être automatiquement provisionnée avec les quotas
  correspondants, sans intervention manuelle.

---

### MOD-20 — Vertical Pack — validation par un 2ᵉ vertical fictif

- **Objectif** : module de *validation*, pas de production — prouver
  concrètement que `MOD-02` tient sa promesse ("aucune refonte majeure pour
  un nouveau métier") avant d'aller plus loin dans la roadmap.
- **Fonctionnalités** : création d'un vertical fictif de test (ex. "Cabinet
  de conseil" ou "Artisan du bâtiment") avec ses propres catégories de
  prospects, catalogue de services, gabarits de message, règles de
  scoring par défaut — entièrement par configuration.
- **Dépendances** : `MOD-02`, `MOD-03`, `MOD-05`, `MOD-09`, `MOD-11`.
- **Priorité** : Critique — ce module est un **jalon de vérité**, pas une
  fonctionnalité livrée aux utilisateurs (il peut être retiré ou gardé
  comme fixture de test après validation).
- **Risques techniques** : si ce module révèle que `MOD-02` a des lacunes,
  il faut accepter de revenir en arrière sur `MOD-02` avant de continuer —
  c'est le but recherché (mieux vaut le découvrir ici qu'en production).
- **Choix d'architecture** : ce vertical fictif sert aussi de fixture pour
  les tests de non-régression multi-vertical futurs (garder le jeu de
  données de test au-delà de la validation initiale).
- **Tests à prévoir** : le golden path complet (prospection → mission)
  rejoué avec ce vertical fictif, sans aucune ligne de code spécifique.
- **Critères de fin** : le golden path fonctionne pour les deux verticaux
  (Provence 360 et le vertical fictif) avec un seul et même code
  applicatif.

---

### MOD-21 — Multi-tenant Organization/Workspace (v0.2, priorisé avant MOD-02)

- **Objectif** : rendre Autorun capable d'héberger plusieurs entreprises,
  avec une isolation des données garantie côté serveur (jamais seulement
  côté interface), tout en gardant Provence 360 entièrement fonctionnelle
  et migrée sans perte de donnée.
- **Fonctionnalités** : modèle `Workspace` (sous-espace au sein d'une
  `Organization`, inchangée), `WorkspaceMembership` (8 rôles :
  Owner/Admin/Manager/Commercial/Opérateur/Comptable/Support/Viewer),
  `WorkspaceInvitation` (invitation + acceptation, création de compte si
  nécessaire), workspace actif persisté côté serveur
  (`Session.activeWorkspaceId`, jamais un identifiant client de confiance),
  sélecteur de workspace, pages de gestion des workspaces et de leurs
  membres, matrice de permissions (`src/lib/workspace-permissions.ts`),
  audit systématique (création, invitation, changement de rôle,
  archivage, changement de workspace actif, accès refusé).
- **Dépendances** : `MOD-00` (fondations), `MOD-01` (identité).
- **Priorité** : Critique — condition explicite de cette phase.
- **Risques techniques** :
  - Confusion de vocabulaire (`Organization` du schéma = "Workspace" du
    produit) — mitigé par l'ADR 0005 qui documente explicitement ce choix
    et pourquoi un renommage complet a été écarté pour cette phase.
  - Chemins de création d'organisation multiples (inscription, seed de
    démonstration) devant chacun créer le workspace par défaut — un oubli
    a été détecté et corrigé pendant la vérification finale de cette
    phase (`prisma/seed.ts` ne créait pas de workspace ; corrigé avant
    livraison, voir le rapport de vérification).
  - Confiance implicite dans un identifiant transmis par le client — mitigé
    systématiquement : toute route qui reçoit un `workspaceId`/`id` depuis
    l'URL ou le corps de la requête le revérifie contre l'organisation de
    l'acteur authentifié avant tout accès (`resolveWorkspaceOrThrow`,
    `setActiveWorkspace`).
- **Choix d'architecture** : voir ADR 0005 (Organization inchangée +
  Workspace additif, pas de renommage) et ADR 0006 (rôles de workspace
  additifs, mapping de migration documenté). Deux systèmes de rôles
  cohabitent temporairement (`MembershipRole` historique, `WorkspaceRole`
  nouveau) — assumé, pas une incohérence accidentelle.
- **Tests à prévoir** (tous livrés, voir `tests/tenant-isolation/`) :
  isolation entre deux organisations, isolation entre deux workspaces
  d'une même organisation, accès autorisé/interdit avec journalisation,
  tentative de falsification d'un identifiant de workspace, changement de
  rôle, archivage (workspace par défaut protégé), cycle de vie complet
  (création, invitation, acceptation, retrait), invariants de migration
  sur les données réelles de Provence 360, et un test e2e Playwright
  dédié (`tests/e2e/two-organisations-isolation.mjs` — deux organisations,
  deux utilisateurs, vérification croisée qu'aucun ne voit les données de
  l'autre).
- **Critères de fin** : golden path Provence 360 inchangé après migration ;
  toute nouvelle organisation (inscription ou seed) reçoit automatiquement
  un workspace par défaut fonctionnel ; 100 % des tests listés ci-dessus
  passent contre une vraie base PostgreSQL.

---

### MOD-22 — Framework des Agents IA (v0.3, priorisé avant MOD-20)

- **Objectif** : donner à Autorun une infrastructure unique et uniforme
  pour héberger plusieurs centaines d'agents IA différents, sans jamais
  coder un agent « à part ». Cette phase ne livre **aucun agent métier** —
  uniquement le socle que tout agent métier futur devra utiliser.
- **Fonctionnalités** : architecture à deux niveaux `AgentDefinition`
  (catalogue global ou par organisation, aucun code exécutable) /
  `AgentInstallation` (instance par workspace, droits toujours un
  sous-ensemble plafonné de ce que la définition déclare et de ce que le
  rôle de l'acteur humain autorise) ; cycle de vie complet (installer,
  désinstaller, activer, désactiver, suspendre, reprendre) ; registre de
  runtimes en mémoire (`registerAgentRuntime`) peuplé au démarrage du
  serveur ; moteur d'exécution basé sur une file interne PostgreSQL
  (création, priorités, timeout, reprises automatiques, annulation,
  journal) ; mémoire à trois portées (temporaire à TTL, persistante,
  partagée au workspace) avec un champ `embedding` réservé mais inutilisé
  pour une vectorisation future ; système de communication inter-agents
  historisé (messages, demandes d'intervention humaine) ; registre unique
  d'outils déclaratifs, activable/désactivable par agent installé ;
  permissions vérifiées côté serveur pour chaque appel d'outil et chaque
  action sensible (réutilise `WorkspacePermission` de v0.2, aucun système
  parallèle) ; scheduler pour tâches ponctuelles, récurrentes et
  événementielles ; observabilité (statistiques d'exécution, durée, coût
  IA agrégé via `AIRequest.agentRunId`, journaux) ; interface
  d'administration (`/settings/agents`) listant agents, état,
  configuration, permissions, outils, statistiques, historiques, journaux.
- **Dépendances** : `MOD-00` (fondations), `MOD-21` (workspace, rôles,
  audit — l'installation d'un agent est toujours scopée à un workspace).
- **Priorité** : Critique — condition explicite de cette phase, prérequis
  de tout agent métier futur.
- **Risques techniques** :
  - Confiance implicite dans les droits déclarés par une définition
    d'agent — mitigé par `assertGrantsWithinDeclaredCeiling`, qui refuse
    toute installation ou mise à jour de droits dépassant à la fois le
    plafond déclaré par la définition et le rôle réel de l'acteur humain
    dans le workspace.
  - Contrainte SQL : l'unicité `(organizationId, key)` sur
    `AgentDefinition` et `(workspaceId, installationId, scope, key)` sur
    `AgentMemoryEntry` ne peut pas s'appliquer correctement quand la
    colonne nullable vaut `NULL` (deux lignes `NULL` ne sont jamais égales
    en SQL) — mitigé par une logique applicative de recherche puis
    création/mise à jour (jamais un simple `upsert`), documentée dans le
    code et dans l'ADR 0009.
  - Ordre de suppression en cascade : `AgentInstallation.definitionId` est
    en `ON DELETE RESTRICT` — toute suppression de test doit supprimer les
    organisations (qui cascadent les installations) avant les
    définitions d'agent, jamais l'inverse.
  - Isolement des tests en exécution parallèle (Vitest exécute les
    fichiers de test concurremment) : le nettoyage de fixtures de test
    doit cibler des identifiants exacts, jamais un filtre large type
    `startsWith`, sous peine de supprimer des lignes encore utilisées par
    un autre fichier de test en cours d'exécution.
- **Choix d'architecture** : voir ADR 0007 (catalogue/installation à deux
  niveaux, réutilisation de `WorkspacePermission`), ADR 0008 (file
  d'exécution interne PostgreSQL plutôt que `pg-boss` dès maintenant —
  `MOD-15` remplacera l'implémentation interne sans changer l'API
  publique du moteur d'exécution) et ADR 0009 (une seule table
  `AgentMemoryEntry` à discriminant `scope` plutôt que trois tables,
  vectorisation différée sans fournisseur externe intégré).
- **Tests à prévoir** (tous livrés, voir `tests/agents/` et
  `tests/tenant-isolation/agents.test.ts`) : cycle de vie d'installation
  (plafond de droits, transitions valides/invalides, désinstallation),
  moteur d'exécution (succès de bout en bout, refus d'outil non accordé,
  timeout, reprise automatique puis échec définitif, annulation, refus
  d'exécuter une installation non active), mémoire/communication/
  planification (portées, expiration, validation, messages,
  interventions, planifications ponctuelles), isolation multi-tenant
  (aucune fuite d'installation, d'exécution, de mémoire ou de message
  entre deux organisations ; falsification d'identifiant rejetée par
  `NotFoundError`).
- **Critères de fin** : golden path Provence 360 et isolation multi-tenant
  inchangés après cette phase ; 100 % des tests listés ci-dessus passent
  contre une vraie base PostgreSQL ; aucun agent métier livré.

## 4. Ordre logique de développement

```
v0.1  MOD-00 (fondations)
        │
v0.2  MOD-02 (configuration métier — le plus risqué, fait tôt et isolé)
        │
v0.3  MOD-20 (validation 2ᵉ vertical) ── en parallèle : ajustements MOD-01/03/05/09/11
        │
v0.4  MOD-12 (facturation — base fonctionnelle)
        │
v0.5  MOD-12 (facturation — Stripe réel)          ── nécessite MOD-15 pour les webhooks
        │
v0.6  MOD-13 (documents)          ── peut être développé en parallèle de MOD-14
v0.7  MOD-14 (calendrier)         ── en parallèle de MOD-13 si ressources disponibles
        │
v0.8  MOD-15 (jobs) puis migration MOD-04/MOD-05/MOD-06/MOD-12/MOD-14 vers jobs
        │
v0.9  MOD-16 (observabilité) + MOD-06 (connecteurs email réels) + MOD-04 (IA réelle)
        │
v0.10 MOD-17 (sécurité avancée — porte obligatoire)
        │
v1.0  MOD-18 (API/intégrations) + MOD-19 (SaaS billing) → première version stable
```

Remarque d'ordonnancement : `MOD-15` (infrastructure de jobs) est listé en
`v0.8` pour rester didactique (un module à la fois), mais rien n'empêche de
l'avancer plus tôt si `MOD-04`/`MOD-06` réels sont priorisés avant
`MOD-12`/`MOD-13`/`MOD-14` — l'ordre strict n'est obligatoire que pour
`MOD-00 → MOD-02 → MOD-20`, le reste est réordonnable selon les priorités
business du moment (voir `MILESTONES.md` §"Flexibilité de l'ordre").

Ce diagramme reflète le plan initial de ce document. En pratique, `v0.2` a
livré `MOD-21` (multi-tenant) à la place de `MOD-02` (voir §1 bis) et
`v0.3` a livré `MOD-22` (Framework des Agents) à la place de `MOD-20`
(voir §1 ter) ; `MOD-02` et `MOD-20` restent à faire, désormais après
`v0.3`. Voir `MILESTONES.md` pour l'état réel version par version.

## 5. Éléments parallélisables

- `MOD-13` (documents) et `MOD-14` (calendrier) sont indépendants l'un de
  l'autre — deux personnes/équipes peuvent les développer en même temps.
- `MOD-16` (observabilité) peut démarrer dès `v0.1` en tâche de fond et
  progresser en continu plutôt qu'en bloc unique en `v0.9`.
- La rédaction de la documentation développeur (`DEVELOPMENT_GUIDE.md`,
  ADRs) est parallélisable à tout moment, par toute personne, sans
  dépendance de code.
- Les connecteurs `MOD-06` (SMTP, puis Gmail, puis Outlook) sont
  indépendants entre eux une fois l'interface stable — développables par
  ordre de priorité client sans se bloquer mutuellement.
- `MOD-08` (déjà générique) ne bloque et n'est bloqué par aucun autre
  module — peut être traité à tout moment s'il reste du temps disponible.

## 6. Fonctionnalités pouvant être ajoutées plus tard (report explicite)

- Éditeur de workflows visuel no-code (au-delà du moteur de règles simple
  de `MOD-09`).
- Marketplace d'intégrations et de verticaux tiers.
- Application mobile.
- i18n complète de l'interface (au-delà de la génération de messages
  multilingue déjà supportée).
- SSO/SAML et 2FA complets (amorcés en `MOD-17`, complétés après `v1.0`
  selon la demande réelle de clients entreprise).
- Isolation renforcée par base/schéma dédié pour les très gros comptes
  (au-dessus du multi-tenant standard par `organizationId`).
- Résolution fine des conflits de synchronisation calendrier
  bidirectionnelle.

## 7. Optimisations futures (post v1.0, non bloquantes)

- Migration `pg-boss` → Redis/BullMQ si le volume de jobs le justifie
  réellement (mesurer avant de migrer).
- Cache applicatif (Redis) pour les statistiques/dashboard si la charge de
  requêtes agrégées le justifie.
- Recherche plein texte avancée (Elasticsearch ou équivalent) si la
  recherche PostgreSQL standard devient limitante.
- Découpage en microservice du worker IA si son cycle de déploiement doit
  diverger fortement du reste de l'application.
- Multi-région pour la latence/conformité de données selon les marchés
  adressés.

## 8. Intégrations externes recommandées (par ordre de valeur/effort)

1. **Anthropic (Claude)** — `MOD-04`, cœur de la proposition de valeur IA.
2. **Stripe** — `MOD-12`/`MOD-19`, paiement et facturation, indispensable
   dès qu'il y a de l'argent réel en jeu.
3. **SMTP générique** — `MOD-06`, connecteur email le plus simple à livrer
   en premier (avant Gmail/Outlook, plus coûteux en intégration OAuth).
4. **Gmail API / Outlook API** — `MOD-06`, valeur élevée mais effort
   d'intégration OAuth plus important, à prioriser après SMTP.
5. **Google Calendar / Outlook Calendar** — `MOD-14`.
6. **S3 / R2 / MinIO** — `MOD-13`, stockage documentaire.
7. **Sentry** — `MOD-16`, capture d'erreurs.
8. **Mapbox ou Leaflet + fournisseur de tuiles** — carte interactive réelle
   (fonctionnalité différée, cf. `docs/01-SPECIFICATION.md` §5).

---

*Document de planification — voir `BACKLOG.md` pour les tâches détaillées,
`MILESTONES.md` pour le découpage en versions livrables, et
`DEVELOPMENT_GUIDE.md` pour les modalités concrètes de travail.*
