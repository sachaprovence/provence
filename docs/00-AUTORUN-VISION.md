# Autorun — Vision et conception de la plateforme

> Document de conception (aucune implémentation). Positionne **Autorun**, la
> plateforme SaaS d'automatisation d'entreprise, par rapport au code déjà
> existant dans ce dépôt : le MVP **Provence 360** (voir
> `docs/01-SPECIFICATION.md` et `docs/02-ARCHITECTURE.md`) n'est pas jeté —
> il devient le **premier vertical de référence** sur lequel Autorun est
> extrait et généralisé. Ce document ne remplace pas les deux précédents,
> il les chapeaute.

## 0. Où on en est réellement

Le dépôt contient déjà un MVP fonctionnel, pas une page blanche :

- Next.js 16 (App Router, TS strict), Prisma 7 / PostgreSQL, Tailwind v4,
  Zod, sessions maison, Vitest + Playwright.
- Un modèle de données **déjà multi-tenant** (`Organization` en racine de
  quasiment toutes les tables, `Membership.role` pour le RBAC).
- Deux abstractions fournisseur déjà correctement isolées :
  `AIProvider` (`src/lib/ai/types.ts`) et `EmailProvider`
  (`src/lib/email/types.ts`), avec implémentations démo remplaçables sans
  toucher au reste du code.
- Un moteur de séquences, un moteur de scoring, un moteur de règles
  d'automatisation, un journal d'audit, une gestion de liste d'exclusion
  RGPD — tous fonctionnels mais **codés en dur pour le métier "visites
  virtuelles 3D"** (enums `LeadCategory`, `ServiceKind`, étapes de pipeline
  fixes à 15 valeurs, etc.).

C'est une base saine. La bonne stratégie n'est **pas** de repartir de zéro
sur une architecture "générique idéale", mais d'extraire progressivement ce
qui est déjà bien fait, et de rendre configurable ce qui est aujourd'hui
figé pour un seul métier. Toute décision ci-dessous est prise avec ce
principe en tête : réutiliser, généraliser, ne pas réécrire.

## 1. Vision globale

Autorun est une plateforme d'automatisation intelligente qui centralise, pour
une PME/ETI, l'ensemble du cycle de vie commercial et opérationnel :
prospects → clients → projets → devis → factures → missions/livraisons,
avec autour : documents, tâches, calendrier, emails, statistiques, agents IA
et intégrations tierces.

Provence 360 (visites virtuelles 3D/360°) est le premier client interne et le
premier "vertical" — un jeu de configuration métier (catégories de
prospects, catalogue de services, règles de scoring, gabarits de messages,
étapes de pipeline) au-dessus d'un **noyau générique** commun à toute
activité B2B. Un deuxième vertical (agence immobilière, cabinet de conseil,
artisan du bâtiment, etc.) doit pouvoir être ajouté **sans toucher au
noyau**, uniquement en écrivant un nouveau jeu de configuration.

## 2. Objectifs fonctionnels

- Un pipeline unique de bout en bout : prospect → qualification → contact →
  rendez-vous → devis → client → mission/projet → facture.
- Des agents IA spécialisés (analyse, scoring, rédaction, classification de
  réponses, reporting) orchestrés, traçables (coût, prompt, réponse) et
  toujours validables par un humain avant action irréversible (envoi,
  facturation).
- Une automatisation configurable sans code (règles déclencheur → action)
  pour la majorité des cas d'usage, avec extension possible via workflows
  plus riches à terme.
- Un tableau de bord et des statistiques par organisation, par rôle, par
  période.
- Une conformité RGPD/anti-spam intégrée nativement (liste d'exclusion,
  consentement, désinscription, limites d'envoi), pas ajoutée après coup.
- Une capacité multi-métier : le même noyau doit servir une agence
  immobilière comme une entreprise de services B2B, via configuration.

## 3. Objectifs techniques

- **Multi-tenant strict** dès le noyau (déjà le cas) : aucune fuite de
  données inter-organisation, vérifiée à la fois par le code et par des
  tests automatisés dédiés.
- **Modularité** : séparer noyau générique / verticaux métier / intégrations
  tierces / agents IA, avec des interfaces stables entre ces couches.
- **Évolutivité sans refonte** : passer d'un mono-tenant auto-hébergé à un
  SaaS multi-tenant à grande échelle sans changer les fondations (le modèle
  de données le permet déjà).
- **Testabilité** : logique métier couverte par tests unitaires, parcours
  critiques couverts par tests e2e, contrats des interfaces fournisseur
  testés indépendamment de leur implémentation.
- **Observabilité** : traçabilité complète des actions automatisées et des
  appels IA (déjà en germe avec `AuditLog` et `AIRequest`).
- **Coût maîtrisé** : pas de dépendance payante imposée en dessous d'un
  certain seuil d'usage (mode démo/self-host doit rester possible).

## 4. Utilisateurs visés

| Profil | Besoin principal |
|---|---|
| Dirigeant de TPE/PME (ex. Provence 360) | Centraliser prospection, vente, exécution sans multiplier les outils |
| Commercial / chargé de clientèle | Qualifier, relancer, valider des messages, suivre son pipeline |
| Prestataire / exécutant terrain | Voir uniquement ses missions/son territoire, mettre à jour l'avancement |
| Administrateur SaaS (futur, côté éditeur Autorun) | Gérer les organisations clientes, la facturation, le support |
| Développeur tiers (futur) | Intégrer Autorun via API/webhooks, créer un nouveau vertical métier |

## 5. Modules principaux

Regroupés par domaine, avec correspondance directe aux entités déjà
présentes dans `prisma/schema.prisma` (rien n'est réinventé) :

1. **Identité & accès** — Organisation, utilisateurs, rôles, sessions,
   territoires (existant : `Organization`, `User`, `Membership`, `Session`).
2. **Prospection & CRM** — prospects, contacts, notes, tags, sources, ICP
   (existant : `Lead`, `LeadContact`, `LeadNote`, `Tag`, `IdealCustomerProfile`).
3. **Analyse & scoring IA** — analyse automatique, score configurable
   (existant : `LeadAnalysis`, `LeadScore`, `AIProvider`).
4. **Campagnes & séquences** — campagnes, séquences multi-canal, enrôlement
   (existant : `Campaign`, `Sequence`, `SequenceStep`, `Enrollment`).
5. **Communication** — comptes email, messages, événements, conversations
   (existant : `EmailAccount`, `Message`, `EmailEvent`, `Conversation`,
   `EmailProvider`).
6. **Suivi commercial** — tâches, rendez-vous, opportunités, devis, offres
   (existant : `Task`, `Appointment`, `Opportunity`, `Quote`, `Service`).
7. **Exécution / production** — clients, missions, prestataires
   (existant : `Customer`, `Mission`, `Provider`).
8. **Automatisation** — règles déclencheur → action, notifications
   (existant : `AutomationRule`, `Notification`).
9. **Conformité & audit** — exclusion, consentement, journal d'audit
   (existant : `SuppressionEntry`, `ConsentRecord`, `AuditLog`).
10. **IA & intégrations** — journal des appels IA, intégrations tierces,
    webhooks entrants (existant : `AIRequest`, `Integration`,
    `WebhookEvent`).
11. **Nouveau — Facturation client final** (devis → facture, suivi de
    paiement) : absent aujourd'hui (seul `Quote` existe, pas de facture ni
    de paiement) — module à ajouter pour couvrir "factures" du cahier des
    charges.
12. **Nouveau — Gestion documentaire** : absent aujourd'hui, à ajouter
    (stockage de fichiers, association aux prospects/clients/missions).
13. **Nouveau — Calendrier partagé** : `Appointment` existe mais pas de vue
    calendrier ni de synchronisation externe (Google/Outlook Calendar).
14. **Nouveau — Vertical Pack** : couche de configuration par métier
    (catégories, catalogue de services, gabarits de messages, règles de
    scoring par défaut, étapes de pipeline) qui aujourd'hui est codée en dur
    dans les enums Prisma et doit devenir un jeu de données configurable.

## 6. Fonctionnalités essentielles (déjà couvertes ou proches)

Le MVP Provence 360 couvre déjà : auth + RBAC + territoires, ICP, import
CSV, analyse IA + scoring, pipeline CRM (vue tableau + Kanban), génération
de messages avec validation humaine, séquences multi-étapes avec fenêtres
d'envoi et arrêt automatique, rendez-vous/opportunités/devis, missions,
automatisations simples, dashboard/statistiques, conformité RGPD complète
(exclusion, désinscription, consentement, audit). C'est le socle
fonctionnel essentiel d'Autorun — il ne s'agit pas de le refaire, mais de le
généraliser (§5, points 11-14) et de l'ouvrir à d'autres métiers (§14).

## 7. Fonctionnalités avancées (prochaine étape)

- Facturation client (devis → facture → paiement, relances impayés).
- Gestion documentaire (contrats, livrables, pièces jointes) avec stockage
  objet (S3-compatible).
- Calendrier avec synchronisation Google/Outlook.
- Connecteurs email réels (SMTP, Gmail API, Outlook API) — l'interface
  `EmailProvider` est déjà prête pour ça.
- Fournisseurs IA réels (Anthropic en priorité, éventuellement autres) —
  l'interface `AIProvider` est déjà prête pour ça.
- Vraie carte interactive (Mapbox/Leaflet) — les champs
  `Lead.latitude/longitude` existent déjà.
- File de traitement asynchrone robuste (au-delà du cron actuel) pour
  absorber plusieurs organisations en parallèle sans compétition sur les
  mêmes ressources.
- Éditeur de règles d'automatisation plus riche (conditions composées,
  actions multiples, delays).
- Rapports IA générés (déjà amorcé via `AIRequestKind.GENERATE_REPORT`).

## 8. Fonctionnalités futures (roadmap long terme)

- Vertical packs pour d'autres métiers que Provence 360, installables sans
  toucher au noyau.
- Éditeur de workflows visuel (type builder no-code) pour les
  automatisations complexes.
- Marketplace d'intégrations tierces (comptabilité, signature électronique,
  paiement, visioconférence).
- Facturation SaaS multi-plan pour Autorun lui-même (Stripe Billing,
  quotas d'usage IA/emails par plan).
- SSO/SAML, 2FA/WebAuthn pour les clients entreprise.
- Application mobile (au minimum lecture + validation de messages +
  notifications).
- i18n complète de l'interface (au-delà de la génération de messages
  multilingue déjà supportée).
- API publique documentée + webhooks sortants pour intégrateurs tiers.
- Isolation renforcée par plan (DB dédiée ou schéma dédié pour les gros
  comptes, au-dessus du multi-tenant par `organizationId` du plan
  standard).

## 9. Contraintes techniques

- Ne jamais dépendre d'un service payant pour qu'une organisation en mode
  démo/essai puisse fonctionner (déjà respecté par les providers démo —
  à conserver comme règle absolue pour toute nouvelle fonctionnalité).
- Toute intégration de fournisseur externe doit passer par une interface
  (`AIProvider`, `EmailProvider`, et futures `CalendarProvider`,
  `StorageProvider`, `PaymentProvider`) — jamais d'appel direct à un SDK
  tiers depuis le code métier.
- Toute clé API sensible reste strictement côté serveur (déjà respecté,
  règle à documenter et faire respecter par lint/convention de nommage
  `NEXT_PUBLIC_*` interdit pour les secrets).
- Le passage d'un vertical métier codé en dur (enums Prisma) à un vertical
  configurable doit se faire par migrations progressives, sans interruption
  du MVP Provence 360 en production.
- Compatibilité ascendante des migrations Prisma : toute évolution de schéma
  destinée à généraliser un champ (ex. `LeadCategory` fixe → catégories
  configurables par organisation) doit prévoir une migration de données, pas
  seulement de schéma.

## 10. Contraintes de sécurité et conformité

- Isolation multi-tenant vérifiée par des tests automatisés dédiés (et pas
  seulement par relecture de code) : pour chaque route API, un test qui
  vérifie qu'un acteur d'une organisation A ne peut ni lire ni écrire une
  ressource de l'organisation B.
- RBAC centralisé (`src/lib/permissions.ts`) : toute nouvelle route doit
  passer par les fonctions de permission existantes, jamais de vérification
  de rôle ad hoc dupliquée dans une route.
- RGPD : conservation de `SuppressionEntry`/`ConsentRecord`/`AuditLog` comme
  fondations non négociables, à étendre (droit à l'oubli, export de
  données) avant toute ouverture SaaS publique.
- Aucune donnée de carte de paiement stockée directement (passer par un
  PSP tokenisé — Stripe — dès l'introduction de la facturation).
- Audit log immuable (pas de suppression/modification a posteriori) pour
  les actions sensibles.
- Revue de sécurité (type OWASP Top 10) obligatoire avant toute ouverture
  multi-organisation publique (au-delà de l'usage interne actuel).

## 11. Architecture logicielle recommandée

Principe directeur : **extraction progressive**, pas de réécriture. Le
noyau générique se construit *à partir* du code Provence 360 existant, en
retirant ce qui est spécifique au métier et en le faisant remonter dans une
couche de configuration.

```
┌─────────────────────────────────────────────────────────┐
│  Verticaux métier (config + gabarits + règles par défaut)│
│  Provence 360 (3D/360°) · [futur] Immobilier · [futur] …  │
├─────────────────────────────────────────────────────────┤
│  Noyau Autorun (générique, indépendant du métier)          │
│  CRM · Pipeline configurable · Automatisation · Facturation │
│  Documents · Calendrier · Statistiques · RBAC · Audit        │
├─────────────────────────────────────────────────────────┤
│  Fournisseurs (interfaces stables, implémentations pluggables) │
│  AIProvider · EmailProvider · CalendarProvider · StorageProvider │
│  PaymentProvider · Intégrations tierces (webhooks)                │
├─────────────────────────────────────────────────────────┤
│  Infrastructure                                                    │
│  PostgreSQL (multi-tenant) · File de jobs · Stockage objet · Cache  │
└─────────────────────────────────────────────────────────┘
```

Décisions structurantes :

- **Rester sur un monolithe modulaire** (Next.js App Router) tant que la
  charge le permet — pas de microservices prématurés. La séparation en
  couches ci-dessus se fait d'abord **dans le code** (packages internes),
  pas forcément en services réseau séparés.
- **Isoler les enums métier fixes** (`LeadCategory`, `ServiceKind`, étapes
  de `LeadStage`) derrière une couche de configuration par organisation
  (table `Organization`-scoped au lieu d'enum Prisma global), en gardant les
  enums génériques (statuts techniques : `MessageStatus`, `QuoteStatus`...)
  qui n'ont pas de raison de varier par métier.
- **Introduire un worker dédié** pour sortir le traitement des séquences,
  des appels IA et des imports du cycle requête/réponse HTTP, dès que
  plusieurs organisations actives simultanément deviennent réalistes (le
  cron actuel suffit pour une seule organisation interne).
- **Multi-tenant par `organizationId` d'abord** ; schéma/DB dédiée réservée
  aux gros comptes entreprise plus tard (isolation renforcée à la demande,
  pas par défaut — coût d'infra proportionnel au besoin réel).

## 12. Stack technique proposée

| Couche | Aujourd'hui (Provence 360) | Évolution Autorun |
|---|---|---|
| Frontend/BFF | Next.js 16 App Router, TS strict, Tailwind v4 | Conservé ; ajout progressif d'un design system partagé (shadcn/ui ou équivalent) pour cohérence multi-vertical |
| Backend | Route Handlers Next.js | Conservé tant que la charge le permet ; extraction possible en service API dédié seulement si un besoin concret l'impose (accès mobile natif, intégrations tierces à fort volume) |
| ORM / DB | Prisma 7 + PostgreSQL 16 | Conservé ; schéma généralisé (voir §11) |
| Cache / files de jobs | Aucun (cron in-process) | `pg-boss` (jobs sur PostgreSQL, sans nouvelle brique d'infra) en premier palier ; migration vers Redis/BullMQ seulement si le volume l'exige |
| Stockage fichiers | Aucun | S3-compatible (MinIO en self-host / S3, R2 ou équivalent en SaaS managé) |
| Auth | Sessions maison + bcrypt | Conservé pour le cœur ; ajout SSO/SAML et 2FA comme option entreprise (Auth.js ou solution dédiée en couche additive, pas en remplacement) |
| IA | `AIProvider` interne, démo déterministe | Implémentation réelle basée sur l'API Anthropic (Claude), journalisée via `AIRequest` déjà en place |
| Email | `EmailProvider` interne, démo | SMTP générique + Gmail/Outlook API en implémentations additionnelles |
| Paiement | Aucun | Stripe (facturation client final + abonnement SaaS Autorun) |
| Tests | Vitest + Playwright | Conservé ; ajout de tests d'isolation multi-tenant dédiés et de tests de contrat par interface fournisseur |
| CI/CD | À définir | GitHub Actions : lint + typecheck + tests unitaires + build sur chaque PR ; e2e sur merge vers `main` ; déploiement automatique par environnement (preview / staging / prod) |
| Observabilité | Journal applicatif (`AuditLog`) | Ajout logs structurés (pino), erreurs (Sentry), métriques/traces (OpenTelemetry) avant ouverture SaaS publique |
| Déploiement | Docker + docker-compose | Conservé pour self-host ; ajout d'un hébergement managé (Vercel ou conteneurs sur Fly.io/Railway/ECS) pour le SaaS, PostgreSQL managé (Neon/RDS) |

## 13. Organisation des dossiers (cible)

Évolution recommandée d'un unique `src/` vers un monorepo pnpm +
Turborepo, mais **uniquement une fois** le besoin de partager du code entre
plusieurs déploiements (worker séparé, plusieurs verticaux) devient concret
— pas par anticipation pure :

```
autorun/
├── apps/
│   ├── web/                # Next.js — UI + Route Handlers (héritier direct de src/ actuel)
│   └── worker/              # Traitement asynchrone (séquences, IA, imports) — nouveau
├── packages/
│   ├── core-domain/          # Entités, schémas Zod, règles métier génériques
│   ├── db/                    # schema.prisma, migrations, client généré
│   ├── ai-agents/               # AIProvider + implémentations + orchestration agents
│   ├── integrations/             # EmailProvider, CalendarProvider, StorageProvider, PaymentProvider
│   ├── ui/                        # Design system partagé (composants React)
│   └── config/                     # eslint, tsconfig, tailwind presets partagés
├── verticals/
│   ├── provence360/                  # Config du vertical actuel : ICP par défaut, catalogue de services,
│   │                                  # gabarits de messages, règles de scoring, étapes de pipeline
│   └── generic/                       # Vertical par défaut minimal pour un nouveau client sans config métier
├── docs/                                # Ce dossier (vision, spec, architecture, ADR)
├── infra/                                # Dockerfiles, docker-compose, éventuel IaC (Terraform)
└── tests/                                 # e2e cross-app
```

Tant que le monolithe suffit, cette structure peut rester **logique** (des
sous-dossiers dans `src/lib/` jouant le rôle de `packages/`) sans passer
tout de suite par un vrai monorepo multi-packages — éviter la complexité
d'outillage (Turborepo, publication interne) avant qu'elle ne soit
nécessaire.

## 14. Stratégie de développement

1. Ne jamais casser le parcours Provence 360 actuel pendant la
   généralisation : chaque extraction se fait derrière les tests existants
   (unitaires + e2e `golden-path.mjs`), qui servent de filet de sécurité de
   non-régression.
2. Généraliser un module à la fois, dans l'ordre de dépendance la plus
   faible vers la plus forte : d'abord la configuration métier (catégories,
   catalogue), puis les modules nouveaux et indépendants (facturation,
   documents, calendrier), enfin le pipeline configurable (le plus
   transverse, donc le plus risqué).
3. Documenter chaque décision structurante sous forme d'ADR (Architecture
   Decision Record) dans `docs/adr/` — court, daté, avec alternatives
   considérées et raison du choix.
4. Introduire un deuxième vertical *fictif* de test (pas un vrai client)
   dès que le noyau générique existe, pour valider concrètement qu'aucune
   refonte majeure n'est nécessaire — c'est le test de vérité de l'objectif
   "n'importe quelle activité sans refonte majeure".
5. Garder le mode démo/sans-clé-API comme exigence permanente à chaque
   nouvelle fonctionnalité, pas seulement au MVP initial.

## 15. Feuille de route par phases

- **Phase 0 — État actuel** : MVP Provence 360 mono-vertical, tel que
  documenté dans `docs/01-SPECIFICATION.md`/`02-ARCHITECTURE.md`. Terminé.
- **Phase 1 — Généralisation du noyau** : extraction de la configuration
  métier hors des enums Prisma fixes (catégories, catalogue de services,
  étapes de pipeline configurables par organisation), sans changer le
  comportement observable de Provence 360.
- **Phase 2 — Modules transverses manquants** : facturation client final,
  gestion documentaire, calendrier avec synchronisation externe.
- **Phase 3 — Robustesse multi-organisation** : file de jobs dédiée
  (pg-boss), observabilité (logs structurés, erreurs, métriques), tests
  d'isolation multi-tenant systématiques, connecteurs email/IA réels.
- **Phase 4 — Ouverture SaaS** : onboarding self-service, facturation
  d'abonnement (Stripe), quotas par plan, deuxième vertical réel, API
  publique + webhooks.
- **Phase 5 — Échelle entreprise** : SSO/SAML, 2FA, isolation renforcée à
  la demande (DB dédiée), app mobile, marketplace d'intégrations et de
  verticaux tiers.

Chaque phase se termine par une revue de sécurité et une revue
d'architecture avant de démarrer la suivante.

## 16. Principaux risques techniques

- **Généraliser trop tôt** : construire une couche de configuration
  abstraite avant d'avoir un deuxième cas d'usage réel produit une
  abstraction fausse, coûteuse à corriger. Mitigation : Phase 1 se limite à
  ce qui est nécessaire pour Provence 360 + un vertical fictif de
  validation, rien de plus.
- **Régression silencieuse pendant l'extraction** : un module généralisé
  qui casse un comportement fin du MVP actuel (ex. fenêtre d'envoi d'une
  séquence). Mitigation : tests de non-régression obligatoires avant/après
  chaque extraction.
- **Dérive de coût IA** : appels IA réels non plafonnés en production.
  Mitigation : `AIRequest.estimatedCostUsd` déjà en place, à transformer en
  quota dur par organisation avant tout branchement de fournisseur payant.
- **Fuite multi-tenant** : une nouvelle route qui oublie de filtrer par
  `organizationId`. Mitigation : tests d'isolation automatisés en CI,
  revue de code systématique sur ce point précis.
- **Complexité d'infra prématurée** : introduire Redis/microservices/K8s
  avant d'en avoir besoin. Mitigation : suivre strictement l'ordre de la
  feuille de route (pg-boss avant Redis, monolithe avant services séparés).
- **Verrouillage fournisseur IA/email** : dépendance forte à un seul
  fournisseur. Mitigation : déjà traité par le pattern `AIProvider`/
  `EmailProvider`, à ne jamais contourner par un appel direct.

## 17. Bonnes pratiques à appliquer en continu

- TypeScript strict partout, aucun `any` non justifié.
- Validation Zod systématique à toute frontière (API, import CSV, config
  vertical).
- Aucune logique métier dans les composants React — composants fins,
  logique dans `lib/`.
- Toute nouvelle intégration externe passe par une interface dédiée,
  jamais d'appel SDK tiers direct dans le code métier.
- Tests avant extraction/refactor d'un module existant, pas après.
- Revue de code obligatoire sur : permissions/RBAC, filtrage
  `organizationId`, exposition de secrets, migrations Prisma destructives.
- Pas de fonctionnalité qui requiert une clé API payante pour fonctionner
  en mode démo.
- ADR pour toute décision structurante (changement de stack, introduction
  d'une nouvelle brique d'infra, changement de modèle de données
  transverse).

## 18. Structure Git professionnelle

- `main` : toujours déployable, protégée (revue obligatoire, CI verte
  requise).
- Branches courtes, une par changement : `feat/<sujet>`, `fix/<sujet>`,
  `refactor/<sujet>`, `chore/<sujet>`, `docs/<sujet>`,
  `vertical/<nom-vertical>/<sujet>` pour le travail spécifique à un
  vertical métier.
- Commits au format [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`) pour permettre
  un changelog généré automatiquement.
- Pull requests obligatoires vers `main`, avec description structurée
  (contexte, changement, plan de test) et CI (lint, typecheck, tests)
  verte avant merge.
- Tags sémantiques (`vMAJOR.MINOR.PATCH`) à chaque mise en production,
  changelog associé.
- `CODEOWNERS` par domaine dès que le monorepo est en place (§13), pour
  router automatiquement les revues (ex. `packages/ai-agents/` → équipe
  IA).

## 19. Convention de nommage

- Fichiers et dossiers : `kebab-case` (déjà en usage : `sequence-engine.ts`,
  `automation-engine.ts`).
- Composants React et modèles Prisma : `PascalCase`.
- Variables, fonctions, propriétés : `camelCase`.
- Constantes globales et variables d'environnement : `SCREAMING_SNAKE_CASE`
  (déjà en usage : `AUTH_SECRET`, `CRON_SECRET`).
- Valeurs d'enum : `SCREAMING_SNAKE_CASE` explicite (déjà en usage dans le
  schéma Prisma) — à conserver pour tout enum réellement technique
  (statuts) ; les valeurs métier appelées à varier par vertical (catégories
  de prospects, types de service) migrent vers des données de
  configuration et non des enums.
- Packages internes futurs (monorepo) : `@autorun/<nom-package>` (ex.
  `@autorun/core-domain`, `@autorun/ai-agents`).
- Jamais de préfixe `NEXT_PUBLIC_` sur une variable contenant un secret.

## 20. Stratégie de documentation

- `docs/00-AUTORUN-VISION.md` (ce document) : vision plateforme, à réviser
  à chaque changement de phase de la feuille de route.
- `docs/01-SPECIFICATION.md` : spécification fonctionnelle détaillée du
  vertical Provence 360 (conservé tel quel, sert de référence "vertical
  type").
- `docs/02-ARCHITECTURE.md` : architecture technique détaillée de
  l'implémentation actuelle (conservé, à faire évoluer en même temps que le
  code au fil des phases 1-3).
- `docs/adr/NNNN-titre.md` (à créer dès la première décision structurante
  de la Phase 1) : une décision par fichier, format court (contexte,
  décision, conséquences, alternatives écartées).
- README par package une fois le monorepo en place (§13) : rôle du package,
  ce qu'il expose, ce qu'il ne doit pas contenir.
- Pas de documentation générée automatiquement tant qu'il n'y a pas d'API
  publique (Phase 4) ; à ce moment-là, OpenAPI/Swagger pour les endpoints
  publics.

---

*Prochaine étape : attendre validation de cette conception avant tout
développement (Phase 1 — généralisation du noyau).*
