# Référence des variables d'environnement (v1.3, AR-0177)

Liste exhaustive de toutes les variables lues par le code (vérifiée par
`grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*" src/ scripts/ prisma/` sur
l'ensemble du dépôt — jamais une simple recopie de `.env.example`, qui peut
diverger du code réel). Voir `.env.example` pour un modèle prêt à copier
en développement local.

**Convention** : une variable absente retombe TOUJOURS sur un
comportement "demo" sûr (aucun appel réseau externe, aucune donnée
perdue) plutôt que sur une erreur silencieuse — sauf les 2 exceptions
marquées **Obligatoire** ci-dessous, qui font refuser le démarrage du
serveur (`src/lib/env.ts`, voir ADR 0002).

## Obligatoires (le serveur refuse de démarrer sans elles)

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL (`postgresql://user:pass@host:5432/db?schema=public`). |
| `AUTH_SECRET` | Secret HMAC (signature des liens de désinscription). Minimum 16 caractères — validé au démarrage (`src/lib/env.ts`). |

## Application

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`/`production`/`test` — standard Node.js. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL publique, utilisée pour générer les liens de désinscription. Exposée côté navigateur (préfixe `NEXT_PUBLIC_`) — jamais y placer de secret. |
| `PORT` | `3000` | Port d'écoute (`next start -p <PORT>`, voir Dockerfile). |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent` — `src/lib/logger.ts`. |

## Tâches planifiées (cron)

| Variable | Défaut | Description |
|---|---|---|
| `CRON_SECRET` | — (optionnel) | Secret partagé pour `Authorization: Bearer <CRON_SECRET>` sur les 7 routes `POST /api/cron/*` (comparaison à temps constant, v1.3 AR-0176). Sans cron externe, un déclenchement manuel authentifié reste possible depuis l'UI en mode démo. |

## Fournisseur IA (agents, Director, Commercial...)

| Variable | Défaut | Description |
|---|---|---|
| `AI_PROVIDER` | `demo` | Legacy (`src/lib/ai/`) — `demo` ou fournisseur réel. |
| `LLM_PROVIDER` | `demo` | Framework Agents (`src/lib/agents/llm/`) — `demo`/`anthropic`/`openai`/`azure`/`ollama`/`openrouter`/... (voir le registre pour la liste complète). |
| `AI_API_KEY` | — | Clé API du fournisseur IA réel. **Ne jamais exposer côté navigateur.** |
| `AZURE_OPENAI_API_VERSION` | `2024-02-01` | Version d'API Azure OpenAI, si `LLM_PROVIDER=azure`. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | URL du serveur Ollama local, si `LLM_PROVIDER=ollama` (également utilisé par `EMBEDDING_PROVIDER=ollama`). |

## Knowledge Engine (v0.7) — embeddings et vecteurs

| Variable | Défaut | Description |
|---|---|---|
| `EMBEDDING_PROVIDER` | `demo` | `demo`/`openai`/`cohere`/`voyage`/`mistral`/`huggingface`/`jina`/`nomic`/`ollama`. |
| `VECTOR_STORE` | `pgvector` | `pgvector`/`chroma`/`qdrant`/`weaviate`/... |
| `CHROMA_URL` / `CHROMA_COLLECTION` | — | Si `VECTOR_STORE=chroma`. |
| `QDRANT_URL` / `QDRANT_API_KEY` / `QDRANT_COLLECTION` | — | Si `VECTOR_STORE=qdrant`. |
| `WEAVIATE_URL` / `WEAVIATE_API_KEY` / `WEAVIATE_CLASS` | — | Si `VECTOR_STORE=weaviate`. |

## Email

| Variable | Défaut | Description |
|---|---|---|
| `EMAIL_PROVIDER` | `demo` | `demo`/`smtp`/`resend`/`postmark`/`brevo`/`gmail`/`outlook` (config SMTP/API par organisation via `Integration.config`, pas globale — sauf OAuth ci-dessous). |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | — | Identifiants OAuth Google (app enregistrée), requis pour `EMAIL_PROVIDER=gmail` ET la synchronisation Google Calendar. |
| `GMAIL_OAUTH_REDIRECT_URI` | — | URI de redirection OAuth Gmail (doit correspondre à la config de l'app Google Cloud). |
| `GOOGLE_OAUTH_REDIRECT_URI` | — | URI de redirection OAuth Google Calendar. |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | — | Repli global optionnel (rarement utilisé — la configuration par organisation dans `Integration.config` prévaut). |
| `MICROSOFT_OAUTH_REDIRECT_URI` | — | URI de redirection OAuth Microsoft, requis pour `EMAIL_PROVIDER=outlook`. |

## Facturation SaaS (v1.0)

| Variable | Défaut | Description |
|---|---|---|
| `BILLING_PROVIDER` | `demo` | `demo` (abonnement activé immédiatement) ou `stripe`. |
| `STRIPE_SECRET_KEY` | — | Requis si `BILLING_PROVIDER=stripe`. **Ne jamais exposer côté navigateur.** |
| `STRIPE_WEBHOOK_SECRET` | — | Requis si `BILLING_PROVIDER=stripe` — vérifie la signature de `POST /api/billing/webhook`. |
| `STRIPE_API_BASE_URL` | `https://api.stripe.com/v1` | Override réservé aux tests (serveur HTTP simulé) — ne jamais définir en production. |

## Stockage de fichiers (v1.1)

| Variable | Défaut | Description |
|---|---|---|
| `STORAGE_PROVIDER` | `demo` | `demo` (disque local, perdu sans volume persistant en conteneur) ou `s3`. |
| `STORAGE_S3_BUCKET` / `STORAGE_S3_REGION` / `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | — | Requis si `STORAGE_PROVIDER=s3`. **Ne jamais exposer côté navigateur.** |
| `STORAGE_S3_ENDPOINT` | — | Hôte S3 compatible (MinIO/R2/Scaleway) si différent d'AWS S3. |
| `STORAGE_S3_PUBLIC_URL_BASE` | — | Base d'URL publique si différente de `STORAGE_S3_ENDPOINT` (ex. CDN devant le bucket). |
| `STORAGE_S3_TIMEOUT_MS` | `15000` | Délai maximal (ms) d'une requête S3 avant abandon explicite. |
| `STORAGE_MAX_FILE_SIZE_BYTES` | `20971520` (20 Mo) | Taille maximale d'un fichier téléversé (tous fournisseurs, v1.2 AR-0164). |
| `STORAGE_ALLOWED_MIME_TYPES` | images/PDF/texte/CSV/Word/Excel courants | Liste blanche de types MIME, séparés par des virgules. |

## Signature électronique (devis)

| Variable | Défaut | Description |
|---|---|---|
| `ESIGNATURE_PROVIDER` | `demo` | Voir `src/lib/quotes/esignature/` — aucun fournisseur réel encore implémenté au-delà de l'abstraction (v1.1, voir ADR correspondante). |

## Automation Engine (v0.8) — réglages avancés de performance

| Variable | Défaut | Description |
|---|---|---|
| `QUEUE_PROVIDER` | `postgres` | Backend de file d'attente des jobs. |
| `LOCK_MANAGER` | `postgres` | Backend de verrouillage distribué (bail). |
| `AUTOMATION_WORKER_POOL_SIZE` | voir `concurrency-manager.ts` | Nombre de workers logiques (métrique affichée dans `/settings/metrics`, v1.3 AR-0174). |
| `AUTOMATION_MAX_CONCURRENT_JOBS` | voir `concurrency-manager.ts` | Plafond de jobs traités simultanément. |

## Observabilité

| Variable | Défaut | Description |
|---|---|---|
| `SENTRY_DSN` | — (désactivé) | Capture d'erreurs réelle (v0.9 bis, AR-0048) — sans DSN, `captureException` échoue explicitement (`captured: false`), le journal structuré (`logger.error`) reste la source de vérité première. |

## Sauvegarde (scripts CLI uniquement, v1.2/v1.3)

| Variable | Défaut | Description |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Répertoire de sortie de `scripts/backup-database.ts`/`run-scheduled-backup.ts`/`prune-old-backups.ts`. |
| `BACKUP_S3_DIR` | `./backups/s3` | Répertoire de sortie de `scripts/backup-s3-objects.ts`. |

## Ce qui n'est PAS une variable d'environnement

Twilio (SMS/WhatsApp), et la configuration détaillée des fournisseurs email
SMTP/Resend/Postmark/Brevo, sont des réglages **par organisation**
(`Integration.config`, chiffrés/masqués — voir AR-0154), jamais des
variables d'environnement globales : chaque organisation cliente configure
ses propres identifiants depuis `/settings`.
