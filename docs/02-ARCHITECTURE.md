# Provence 360 — Architecture technique

## 1. Stack

- **Next.js 16** (App Router, TypeScript strict) — pages en Server Components,
  mutations via Route Handlers (`src/app/api/**`) appelées par de petits
  composants clients ("îlots" interactifs).
- **PostgreSQL 16 + Prisma ORM 7** (driver adapter `@prisma/adapter-pg`,
  client généré dans `src/generated/prisma`, non versionné).
- **Tailwind CSS v4** pour le design (palette Provence définie dans
  `src/app/globals.css`).
- **Zod** pour la validation de toutes les entrées API.
- **bcryptjs** pour le hachage des mots de passe, sessions maison stockées en
  base (table `Session`, cookie httpOnly).
- **Vitest** pour les tests unitaires, un script Playwright pour un test de
  bout en bout du parcours principal.
- **Recharts** pour les graphiques du tableau de bord/statistiques.

Aucune dépendance payante n'est requise : tout fonctionne en mode démo
(fournisseurs IA et email simulés, voir §4).

## 2. Arborescence (résumé)

```
prisma/
  schema.prisma        Modèle de données complet
  migrations/           Migrations SQL
  seed.ts               Données de démonstration
src/
  app/
    (auth)/             Connexion, inscription, réinitialisation (public)
    (app)/               Application authentifiée (sidebar + pages)
      dashboard/ leads/ pipeline/ campaigns/ sequences/ inbox/ tasks/
      appointments/ quotes/ missions/ map/ stats/ settings/ users/ onboarding/
    api/                 Route Handlers (toutes les mutations et lectures API)
    unsubscribe/[token]/ Page publique de désinscription
  components/            Composants React (dont les "îlots" clients)
  lib/
    auth.ts              Sessions, hachage, RBAC
    permissions.ts        Règles d'accès par rôle / territoire
    prisma.ts             Client Prisma (driver adapter pg)
    scoring.ts             Moteur de scoring configurable
    sequence-engine.ts      Moteur de séquences (envoi, arrêt automatique)
    automation-engine.ts    Moteur de règles internes
    suppression.ts          Liste d'exclusion / désinscription
    ai/                     Interface AIProvider + implémentation démo
    email/                  Interface EmailProvider + implémentation démo
    validations/            Schémas Zod par domaine
  middleware → src/proxy.ts  Garde d'authentification (Next.js 16 : "proxy")
docs/                    Spécification et architecture
tests/                   Tests unitaires (Vitest) et test e2e (Playwright)
```

## 3. Modèle de données

Voir `prisma/schema.prisma` pour le détail complet (relations, index,
contraintes d'unicité). Entités principales, regroupées par domaine :

- **Organisation & accès** : `Organization`, `User`, `Membership` (rôle +
  territoire), `Session`, `PasswordResetToken`, `LoginEvent`.
- **Ciblage** : `Territory`, `IdealCustomerProfile`.
- **Prospection** : `LeadSource`, `Lead`, `LeadContact`, `LeadNote`, `Tag`.
- **Analyse & scoring** : `LeadAnalysis`, `LeadScore`.
- **Campagnes & séquences** : `Campaign`, `Sequence`, `SequenceStep`,
  `Enrollment`.
- **Communication** : `EmailAccount`, `Message`, `EmailEvent`, `Conversation`.
- **Suivi commercial** : `Task`, `Appointment`, `Opportunity`, `Quote`,
  `QuoteLine`, `Service`.
- **Exécution** : `Customer`, `Mission`, `Provider`.
- **Automatisation & conformité** : `AutomationRule`, `Notification`,
  `SuppressionEntry`, `ConsentRecord`, `AuditLog`.
- **IA & intégrations** : `AIRequest`, `Integration`, `WebhookEvent`.

Toutes les entités métier portent `organizationId` avec index composé
`[organizationId, ...]`, et chaque requête serveur filtre explicitement par
l'organisation de l'utilisateur courant (`leadWhereForActor`,
`requireActor()`), ce qui garantit l'isolation multi-tenant.

## 4. Couches d'abstraction fournisseur

### AIProvider (`src/lib/ai/`)

Interface unique (`analyzeLead`, `recommendScore`, `generateMessage`,
`classifyReply`, `summarizeConversation`, `recommendNextAction`, `translate`,
`generateSalesReport`, `estimateCostUsd`). `DemoAIProvider` est une
implémentation déterministe, sans appel réseau, qui distingue explicitement
faits vérifiés / estimés / manquants dans son analyse. Chaque appel réel (en
production) doit être journalisé dans `AIRequest` (prompt, réponse, modèle,
coût estimé, utilisateur, statut de validation) — ce que fait déjà le code
actuel.

Pour brancher un vrai fournisseur : créer `src/lib/ai/<fournisseur>-provider.ts`
implémentant `AIProvider`, puis l'ajouter dans `src/lib/ai/index.ts` selon la
variable d'environnement `AI_PROVIDER`. La clé API doit être lue uniquement
côté serveur (jamais de préfixe `NEXT_PUBLIC_`).

### EmailProvider (`src/lib/email/`)

Interface `send(email): Promise<SendResult>`. `DemoEmailProvider` simule
l'envoi (les emails restent consultables dans la fiche prospect) et simule un
échec pour toute adresse contenant `invalid`/`bounce`, afin de tester le
comportement de repli. Un vrai fournisseur (SMTP, Gmail API, Outlook API)
s'ajoute de la même façon via `EMAIL_PROVIDER`.

## 5. Moteur de séquences

`src/lib/sequence-engine.ts` :

- `enrollLeadInSequence` — vérifie la liste d'exclusion et les doublons avant
  d'inscrire un prospect.
- `processDueSequences` — traite les inscriptions dont `nextRunAt <= now`,
  génère le message via `AIProvider`, respecte la fenêtre horaire/jours
  autorisés de l'étape, et bascule en validation humaine si requis.
- `sendMessageNow` — envoie réellement (ou simule l'envoi), respecte la
  limite d'envoi quotidienne, revérifie la liste d'exclusion juste avant
  l'envoi (défense en profondeur), puis avance à l'étape suivante.
- `stopEnrollmentsForLead` — arrête toutes les inscriptions actives d'un
  prospect (réponse, RDV, client gagné, adresse invalide, désinscription,
  liste d'exclusion, arrêt manuel).

En local, ce traitement est déclenché soit manuellement (bouton "Traiter les
relances maintenant" en mode démo), soit par un vrai cron système appelant
`POST /api/cron/process-sequences` avec l'en-tête `Authorization: Bearer
<CRON_SECRET>`. Ce choix évite une dépendance à Redis/BullMQ pour le MVP (voir
`docs/01-SPECIFICATION.md` §6).

## 6. Sécurité

- Sessions serveur (table `Session`, cookie httpOnly, `SameSite=Lax`, expiration
  14 jours), mots de passe hachés avec bcrypt.
- Toute route API vérifie l'authentification (`requireActorApi`) puis filtre
  strictement par `organizationId` — aucune requête ne traverse les
  organisations.
- Permissions par rôle (`OWNER_ADMIN`, `SALES`, `PROVIDER`) centralisées dans
  `src/lib/permissions.ts` ; un prestataire ne voit que les prospects/missions
  de son territoire.
- Validation Zod systématique des entrées API.
- Journal d'audit (`AuditLog`) sur les actions sensibles (création/màj de
  prospect, analyse, score, message, validation, désinscription…) et journal
  de connexions (`LoginEvent`) séparé.
- Lien de désinscription signé par HMAC (`AUTH_SECRET`), vérifié en temps
  constant (`crypto.timingSafeEqual`).
- Aucune clé API IA/email n'est exposée au navigateur.

## 7. Fonctionnalités restant à développer après le MVP

Voir `docs/01-SPECIFICATION.md` §5 pour la liste détaillée (connecteurs email
réels, vraie carte interactive, file de traitement distribuée, i18n complète
de l'interface, facturation SaaS, 2FA/SSO, application mobile…).
