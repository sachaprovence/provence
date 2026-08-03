# ADR 0042 — v1.0 : ouverture SaaS, API publique, Stripe Billing, onboarding self-service (MOD-18/MOD-19)

- **Date** : 2026-08-03
- **Statut** : accepté

## Contexte

`v0.10` (ADR 0041) a fermé la porte de sécurité obligatoire avant
l'ouverture SaaS publique. `v1.0` implémente intégralement `AR-0059` à
`AR-0066` (`BACKLOG.md` §Version 1.0), sans modifier le périmètre défini :
API publique versionnée + clés API, rate limiting, webhooks sortants
signés, plans d'abonnement, Stripe Billing, onboarding self-service,
interface de facturation, recette finale.

Deux points du périmètre référencent des prérequis qui n'existent pas
réellement dans le code, et nécessitaient une décision avant
implémentation plutôt qu'un blocage :

- `AR-0063` référence `AR-0027` (« intégration Stripe côté paiement
  client final ») comme prérequis. Une recherche exhaustive (`grep -rli
  "stripe" src/`) a confirmé qu'aucune des tâches `AR-0027` à `AR-0030`
  n'a jamais été implémentée — `BACKLOG.md` les documente d'ailleurs
  lui-même comme explicitement différées. `AR-0063` ne pouvait donc pas
  réutiliser une abstraction `PaymentProvider` existante : elle n'existe
  pas.
- `AR-0064` décrit un parcours d'inscription incluant un « choix du
  vertical de départ (Provence 360, vertical fictif, ou generic) ».
  `MOD-20` (Vertical Pack — validation par un 2ᵉ vertical fictif) est
  documenté dans `ROADMAP.md` comme reporté depuis `v0.4` et jamais
  livré depuis — confirmé par recherche (`grep -rli "vertical"`) :
  aucun concept de vertical métier configurable n'existe dans le code, un
  seul vertical (Provence 360) est câblé en dur. Il n'y a donc rien de
  réel à choisir.

## Décision

### Construire la plomberie Stripe Billing de zéro, sans réutiliser une abstraction inexistante

Plutôt que de bloquer `AR-0063` sur l'implémentation préalable d'`AR-0027`
(hors périmètre explicite de cette itération) ou d'inventer une
abstraction `PaymentProvider` non demandée, décision de construire
`BillingProvider` (`src/lib/billing/types.ts`) comme une interface
dédiée à l'abonnement SaaS (facturation de l'éditeur envers ses clients),
distincte par nature du paiement client final (facturation d'un client
d'une organisation envers cette organisation, `AR-0027`, toujours hors
périmètre). Les deux domaines resteront séparés même si `AR-0027` est un
jour implémentée — ce sont deux relations de facturation différentes
(éditeur→organisation vs organisation→client), pas une duplication.

### Stripe via `fetch()` brut, jamais le SDK officiel `stripe`

Toutes les intégrations externes réelles de ce projet (Sentry, Gmail,
Outlook, Google Calendar) évitent délibérément les SDK officiels au
profit d'appels `fetch()` directs contre l'API REST documentée (voir ADR
0038/0040). Décision de suivre exactement ce même patron pour Stripe :
`src/lib/billing/providers/stripe.ts` implémente `createCustomer`,
`startCheckout`, `changePlan`, `cancelSubscription` via `fetch()`, avec un
encodeur de formulaire à notation par crochets (`toFormBody`, l'API
Stripe attend `application/x-www-form-urlencoded`, pas du JSON) et une
vérification manuelle de signature de webhook (HMAC-SHA256 de
`${timestamp}.${rawBody}`, comparaison en temps constant
`crypto.timingSafeEqual`, tolérance de 5 minutes). C'est un choix plus
disputable que pour les intégrations précédentes — Stripe Billing a une
surface de sécurité réelle (vérification de webhook, gestion de
l'idempotence) — mais la cohérence du projet et l'absence de dépendance
supplémentaire à maintenir l'emportent, et l'implémentation est testée
contre un serveur HTTP local simulant fidèlement l'API Stripe (même
patron que `tests/email/gmail.test.ts`), y compris les cas de signature
falsifiée et de webhook expiré.

### Les quotas restent une source de vérité locale ; Stripe ne gère que le paiement récurrent

`applyPlanToOrganization` (`src/lib/billing/plan-service.ts`, déjà
implémentée pour `AR-0062`) copie les quotas du plan directement sur
`Organization` à chaque souscription/changement de plan/traitement de
webhook. `subscription-service.ts` orchestre le fournisseur de
facturation ET cette fonction, mais ne stocke jamais lui-même de
quotas — le fournisseur (Stripe ou démo) ne connaît que le cycle de
paiement, jamais les quotas applicatifs. Ce choix évite exactement le
risque identifié dans `ROADMAP.md` MOD-19 (« incohérence entre quota de
plan et quota IA technique si les deux mécanismes divergent ») : un seul
mécanisme de quota, jamais deux systèmes parallèles.

### Organisation restreinte : blocage centralisé au niveau du Proxy, jamais route par route

Une organisation en échec de paiement (`invoice.payment_failed` →
`SubscriptionStatus.RESTRICTED`) doit être bloquée en écriture, jamais en
lecture, et sans perte de données. Plutôt que d'ajouter une vérification
dans chaque route mutante individuellement, réutilisation exacte du
patron déjà établi par le rate limiter de v0.10 (`src/proxy.ts`,
qui tourne par défaut sur le runtime Node.js dans ce projet, contrairement
à l'ancien `middleware.ts` limité à l'Edge Runtime) : une seule
vérification centralisée (`isSessionOrganizationRestricted`) bloque toute
requête `POST`/`PUT`/`PATCH`/`DELETE` vers `/api/**`, à l'exception
explicite de `/api/billing`, `/api/cron` et `/api/settings/billing` — une
organisation restreinte doit toujours pouvoir régulariser elle-même sa
facturation. C'est une portée délibérément plus étroite qu'un blocage
exhaustif route par route (justifiée par la centralisation et pour éviter
une requête base de données supplémentaire par route), pas encore
documentée ailleurs qu'ici.

### Onboarding : le provisionnement automatique ne doit jamais bloquer la création de compte

`POST /api/auth/register` déclenche `startOrganizationCheckout` juste
après la création transactionnelle de l'organisation. Décision explicite
de ne jamais faire échouer l'inscription si ce provisionnement échoue
(`try/catch` dédié, `logger.warn`) : l'organisation reste `TRIALING` et
peut réessayer depuis `/settings/billing`. Un compte créé mais non
facturé est un état récupérable ; un compte jamais créé à cause d'un
problème de facturation transitoire ne l'est pas.

### Pas de sélecteur de vertical à l'inscription : rien de réel à choisir

Plutôt que de construire un sélecteur de vertical factice (options sans
comportement différent derrière, puisqu'aucun second vertical n'existe)
ou de bloquer `AR-0064` sur l'implémentation préalable de `MOD-20` (hors
périmètre explicite de cette itération), décision d'omettre ce choix du
parcours d'inscription : une seule organisation, un seul produit
(Provence 360), comme partout ailleurs dans l'application aujourd'hui.
Le jour où `MOD-20` livre un second vertical réel, le sélecteur pourra
être ajouté à `/register` sans affecter la structure actuelle
(`organizationName`/`planKey` déjà distincts et indépendants).

### `GET /api/plans` : un endpoint public séparé de l'API publique versionnée

`AR-0064` a besoin d'un moyen pour un visiteur non authentifié de choisir
un plan AVANT de créer son compte. Décision de créer `GET /api/plans`
comme route interne dédiée à l'UI (pas de clé API, pas de rate limiting
dédié), distincte de `/api/public/v1/**` (API publique versionnée pour
intégrations tierces, authentifiée par clé API) — mélanger les deux
aurait rendu la sémantique de « API publique » ambiguë (une route sans
authentification dans un espace de nommage par ailleurs entièrement
authentifié).

## Conséquences

- Toute organisation existante (pré-v1.0, sans `planId`) continue de
  fonctionner sans changement — `assertMemberLimitAvailable` et le
  blocage `RESTRICTED` sont des mécanismes strictement additifs.
- Le domaine `AR-0027` (paiement client final) reste entièrement à
  construire ; `BillingProvider` (abonnement SaaS) ne doit pas être
  confondu avec, ni réutilisé pour, ce futur domaine.
- `MOD-20` (Vertical Pack) reste entièrement à construire ; le parcours
  d'inscription actuel (`/register`) ne propose qu'un seul produit.
- L'ouverture de l'API publique élargit la surface d'attaque de
  l'application — mitigée dès le premier déploiement (clés API scopées,
  rate limiting, jamais après coup), conformément au risque identifié
  dans `ROADMAP.md` MOD-18.
- Les 4 critères de sortie de `MILESTONES.md` §v1.0 sont vérifiés de bout
  en bout : API publique isolée + rate limitée ; webhook sortant livré
  avec retry prouvé ; changement de plan applique immédiatement les
  quotas ; échec de paiement bascule en statut restreint sans perte de
  données ; parcours d'inscription self-service complet sans intervention
  manuelle (`tests/e2e/self-service-onboarding.mjs`).

## Alternatives écartées

- **Bloquer `AR-0063` jusqu'à l'implémentation d'`AR-0027`** : écartée —
  `AR-0027` est hors périmètre explicite de cette itération et les deux
  domaines de facturation (éditeur→organisation, organisation→client)
  sont indépendants ; les bloquer ensemble aurait retardé `v1.0` sans
  bénéfice.
- **SDK officiel `stripe` (npm)** : écarté pour rester cohérent avec le
  reste du projet (aucune intégration existante n'utilise de SDK
  officiel) — accepté comme un choix plus disputable que pour les
  intégrations précédentes, compensé par une couverture de test dédiée à
  la vérification de signature de webhook.
- **Blocage en écriture route par route pour les organisations
  restreintes** : écarté au profit de la centralisation au niveau du
  Proxy, déjà établie par le rate limiter de v0.10 — évite de dupliquer
  la vérification dans chaque route mutante et une requête base de
  données par route.
- **`GET /api/plans` sous `/api/public/v1/plans`** : écarté — aurait
  mélangé une route sans authentification dans un espace de nommage par
  ailleurs entièrement authentifié par clé API, rendant la sémantique de
  « API publique versionnée » ambiguë.
- **Sélecteur de vertical factice à l'inscription** (`AR-0064`) : écarté —
  aurait ajouté de la complexité UI pour un choix sans aucune conséquence
  réelle (un seul vertical existe), et aurait laissé croire à tort que
  `MOD-20` est livré. Bloquer `AR-0064` sur `MOD-20` a également été
  écarté — `MOD-20` est hors périmètre explicite de cette itération.
