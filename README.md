# Provence 360 — Plateforme d'acquisition client automatisée

Logiciel interne d'acquisition client pour **Provence 360** (visites virtuelles
3D/360°, contenus immersifs Airbnb/Booking, photos professionnelles) :
prospection → analyse → scoring → message personnalisé → séquence de relance
→ réponse → rendez-vous → devis → client → mission, avec tableau de bord,
carte des prospects, et garde-fous anti-spam/RGPD intégrés.

📄 Spécification fonctionnelle : [`docs/01-SPECIFICATION.md`](docs/01-SPECIFICATION.md)
🏗️ Architecture technique : [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md)
🚀 Vision plateforme **Autorun** (ce dont Provence 360 est le premier
vertical) : [`docs/00-AUTORUN-VISION.md`](docs/00-AUTORUN-VISION.md)
🗺️ Plan de développement Autorun : [`ROADMAP.md`](ROADMAP.md) (modules) ·
[`BACKLOG.md`](BACKLOG.md) (tâches) · [`MILESTONES.md`](MILESTONES.md)
(jalons) · [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) (guide de travail)

Le projet fonctionne **entièrement en mode démonstration** dès l'installation
(fournisseurs email et IA simulés) — aucune clé API ni service payant n'est
nécessaire pour l'essayer.

## Sommaire

- [Démarrage rapide (Docker)](#démarrage-rapide-docker)
- [Installation locale (sans Docker)](#installation-locale-sans-docker)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Commandes disponibles](#commandes-disponibles)
- [Parcours de démonstration recommandé](#parcours-de-démonstration-recommandé)
- [Brancher de vrais fournisseurs](#brancher-de-vrais-fournisseurs-après-le-mode-démo)
- [Déploiement](#déploiement)
- [Fonctionnalités restant à développer](#fonctionnalités-restant-à-développer)

## Démarrage rapide (Docker)

Prérequis : Docker et Docker Compose.

```bash
git clone <url-du-dépôt> provence360
cd provence360
docker compose up --build
```

Cela démarre PostgreSQL et l'application (migrations appliquées
automatiquement au démarrage du conteneur `app`). Ouvrez
<http://localhost:3000>, créez un compte via **Créer un compte**, ou seedez
des données de démonstration :

```bash
docker compose exec app npm run db:seed
```

## Installation locale (sans Docker)

Prérequis : Node.js ≥ 20.19, PostgreSQL ≥ 14 accessible localement.

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env
# adapter DATABASE_URL si besoin

# 3. Base de données : créer un rôle et une base (exemple)
psql -c "CREATE USER provence WITH PASSWORD 'provence' CREATEDB;"
psql -c "CREATE DATABASE provence360 OWNER provence;"

# 4. Migrations + génération du client Prisma
npm run db:migrate

# 5. (recommandé) Données de démonstration
npm run db:seed

# 6. Lancer le serveur de développement
npm run dev
```

Application disponible sur <http://localhost:3000>.

## Comptes de démonstration

Créés par `npm run db:seed` (mot de passe identique pour les trois) :

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@demo.provence360.fr` | `demo12345` |
| Commercial | `commercial@demo.provence360.fr` | `demo12345` |
| Prestataire régional | `prestataire@demo.provence360.fr` | `demo12345` |

Le seed crée aussi : une organisation configurée, 4 profils de client idéal,
16 prospects fictifs répartis sur les 7 zones de lancement, une séquence de
relance à 4 étapes, une campagne active avec des prospects inscrits, des
messages envoyés/en attente de validation, des réponses simulées classifiées,
un rendez-vous, une opportunité gagnée avec devis accepté, une mission créée
automatiquement, un prestataire assigné, et un prospect en liste d'exclusion.

Le script est **idempotent** : s'il détecte que les données de démonstration
existent déjà (email admin présent), il ne fait rien.

## Commandes disponibles

```bash
npm run dev          # serveur de développement
npm run build         # build de production
npm run start          # démarrer le build de production
npm run lint            # ESLint
npm run typecheck         # tsc --noEmit
npm run format              # Prettier — reformate src/ et tests/
npm run format:check         # Prettier — vérifie sans modifier (utilisé en CI à terme, voir ADR 0004)
npm run test              # tests unitaires (Vitest)
npm run test:watch         # tests unitaires en mode watch
npm run test:e2e            # test de bout en bout (voir ci-dessous)
npm run db:generate          # régénérer le client Prisma après modif du schéma
npm run db:migrate            # créer/appliquer une migration en dev
npm run db:seed                 # charger les données de démonstration
npm run db:reset                  # réinitialiser la base (⚠️ destructif, usage local uniquement)
```

`GET /api/health` (public) vérifie la connectivité base de données ; utilisé
par le `HEALTHCHECK` Docker. La CI (`.github/workflows/ci.yml`) exécute lint,
typecheck, tests et build sur chaque pull request ; `.github/workflows/e2e.yml`
rejoue le golden path après merge sur `main`.

### Test de bout en bout (parcours principal)

`tests/e2e/golden-path.mjs` pilote un vrai navigateur (Playwright) contre une
instance déjà démarrée et déjà seedée, et vérifie : connexion → analyse IA →
score → génération de message → validation → envoi simulé → inscription en
séquence → réponse simulée → arrêt automatique de la séquence → absence
d'erreur console.

```bash
npx playwright install chromium   # une seule fois
npm run dev &                     # dans un terminal
npm run db:seed                   # si pas déjà fait
npm run test:e2e                  # dans un autre terminal
```

## Parcours de démonstration recommandé

1. Se connecter avec le compte administrateur de démonstration.
2. **Tableau de bord** — vue d'ensemble, bouton *Traiter les relances
   maintenant* (déclenche manuellement le traitement des séquences, utile
   hors cron).
3. **Prospects** — vue tableau, Kanban ; ouvrir un prospect qualifié.
4. Sur la fiche prospect : *Analyser (IA)* puis *Calculer le score*.
5. *Générer un message* (email de premier contact) → le message apparaît en
   attente de validation → *Valider et envoyer* (envoi simulé, visible dans
   le fil de messages).
6. *Inscrire* le prospect dans la séquence de démonstration.
7. Dans *Boîte de réception* (sur la fiche prospect), cliquer *Intéressé*
   pour simuler une réponse → la séquence passe à *STOPPED (REPLIED)* et le
   prospect change automatiquement d'étape dans le pipeline.
8. Créer un rendez-vous, une opportunité, un devis ; marquer l'opportunité
   *Gagné* → une mission est créée automatiquement (visible dans *Missions*).
9. **Prospects → Importer un CSV** pour tester l'import (modèle
   téléchargeable dans la page).
10. Ouvrir le lien de désinscription présent en bas d'un email envoyé (mode
    démo) : le prospect passe en liste d'exclusion et ne peut plus recevoir
    de message (le bouton *Générer un message* devient indisponible sur sa
    fiche).
11. **Statistiques** et **Paramètres** (règles de scoring, automatisations,
    territoires, offres, ICP) — tout est modifiable depuis l'interface.

## Brancher de vrais fournisseurs (après le mode démo)

Le projet est conçu pour remplacer les fournisseurs simulés sans changer le
reste du code :

1. **Email** : 6 fournisseurs réels déjà implémentés — `EMAIL_PROVIDER=smtp`
   (identifiants SMTP), `resend`/`postmark`/`brevo` (clé API), ou
   `gmail`/`outlook` (OAuth2 — connecter depuis Paramètres → Intégrations
   une fois `GMAIL_OAUTH_*`/`MICROSOFT_OAUTH_*` configurées, voir
   `.env.example`). Pour un nouveau fournisseur : implémenter
   `EmailProvider` (`src/lib/email/types.ts`) et l'enregistrer dans
   `src/lib/email/index.ts`.
2. **IA** : `AI_PROVIDER=anthropic` (clé `ANTHROPIC_API_KEY`) est déjà
   implémenté pour la couche IA historique (analyse/scoring/génération de
   message). Un quota mensuel dur optionnel par organisation est
   disponible (`Organization.aiMonthlyBudgetUsd`, réglable dans
   Paramètres → Entreprise). Pour un nouveau fournisseur : implémenter
   `AIProvider` (`src/lib/ai/types.ts`) et l'enregistrer dans
   `src/lib/ai/index.ts`. La clé API reste toujours côté serveur
   uniquement (jamais `NEXT_PUBLIC_*`).
3. **Carte interactive réelle** : les champs `Lead.latitude`/`longitude`
   existent déjà ; brancher Mapbox/Leaflet dans `src/app/(app)/map/page.tsx`
   à la place de la vue liste actuelle.

## Déploiement

Le `Dockerfile` fourni construit une image de production (`next build` +
`prisma migrate deploy` au démarrage du conteneur). `docker-compose.yml`
inclut une base PostgreSQL persistante (volume `provence_db_data`).

Variables d'environnement à définir en production (voir `.env.example`) :
`DATABASE_URL`, `AUTH_SECRET` (secret fort et unique), `NEXT_PUBLIC_APP_URL`
(domaine public, utilisé dans les liens de désinscription), `EMAIL_PROVIDER`
et `AI_PROVIDER` (une fois de vrais fournisseurs branchés), et
`CRON_SECRET` si un cron système externe doit déclencher
`POST /api/cron/process-sequences`.

Sauvegarde/restauration : base PostgreSQL standard — `pg_dump`/`pg_restore`
(ou l'équivalent managé de votre hébergeur). Aucune donnée n'est stockée
ailleurs que dans PostgreSQL (pas de stockage fichier local à sauvegarder
séparément dans le MVP).

## Fonctionnalités restant à développer

Voir [`docs/01-SPECIFICATION.md`](docs/01-SPECIFICATION.md#5-reporté-après-le-mvp-hors-périmètre-v1) :
fournisseurs de données payants, vraie carte interactive, file de
traitement distribuée (BullMQ/Redis), notifications push/Slack,
facturation SaaS multi-plan, i18n complète de l'interface, application
mobile, SSO/2FA, quota email dur (prévu `v0.10`, voir `MILESTONES.md`).
Les connecteurs email réels (SMTP/Resend/Postmark/Brevo/Gmail/Outlook) et
un fournisseur IA réel (Anthropic) sont déjà livrés — voir `MILESTONES.md`
§v0.9 et §v0.9 bis.
