# ADR 0049 — Personal Quest AI : module coach/quêtes personnel isolé dans le dépôt Autorun

- **Date** : 2026-08-11
- **Statut** : accepté (Phase 1 — Core + Phase 2 — IA ; phases 3-6 du brief non
  couvertes par ce lot, voir « Ce qui n'est pas livré » ci-dessous)

## Contexte

Demande directe (hors `BACKLOG.md`/`ROADMAP.md` existants, comme Compta
Vellano — ADR 0048) : livrer **Personal Quest AI**, un assistant personnel
gamifié qui transforme un objectif en succession de petites actions
("quêtes") adaptées en continu à l'utilisateur (coach + stratège + Game
Master + assistant d'exécution). Le dépôt héberge aujourd'hui **Autorun /
Provence 360**, une plateforme SaaS B2B multi-tenant CRM/automatisation, et
déjà un deuxième module métier sans rapport, **Compta Vellano**
(comptabilité pizzeria). Personal Quest AI est un troisième module, **B2C /
personnel** cette fois (pas d'organisation cliente, une seule personne par
compte utilisateur du point de vue métier).

Même choix structurant que l'ADR 0048 : dépôt séparé vs. module isolé
réutilisant l'infrastructure déjà en place (Postgres, Prisma, auth par
session, observabilité, CI/CD). Personal Quest AI n'a pas de client
explicite justifiant un dépôt séparé ; on applique donc la même politique
que Compta Vellano par cohérence, avec une différence : **le scoping des
données**.

## Décision

- **Schéma** : mêmes principes que Compta Vellano — modèles strictement
  préfixés `Quest*`, dans le même schéma Prisma, sans relation vers les
  entités CRM (`Lead`/`Company`/`Quote`/etc.). Contrairement à Compta
  Vellano, **aucun modèle `Quest*` n'a de `organizationId`** : la donnée
  est personnelle à l'utilisateur (`userId`), pas à l'organisation/tenant
  CRM. `User` reste le point d'ancrage (chaque utilisateur du CRM peut
  aussi être un utilisateur de Personal Quest AI), mais l'isolation
  effective est `WHERE userId = actor.user.id` partout, jamais
  `organizationId`. Ça évite d'imposer un concept multi-tenant B2B à un
  produit conçu pour un individu, et ça reste correct pour le cas
  actuel où un utilisateur = une organisation.
- **Auth** : réutilisation stricte de `requireActor`/`requireActorApi`
  (session cookie déjà en place) — pas de nouveau système d'auth. Seul
  `actor.user.id` est consommé par le module.
- **Erreurs / validation / logs** : réutilisation stricte de
  `AppError`/`toApiErrorResponse`, Zod (`src/lib/validations/quest.ts`),
  `pino` (`logger`) — même discipline que le reste du dépôt.
- **IA** : le module a sa **propre** couche IA (`src/lib/quest/ai/*`),
  distincte de `src/lib/ai/` (CRM) et `src/lib/agents/` (Framework
  d'Agents) — même distinction que documentée dans
  `src/lib/ai/providers/anthropic.ts`. Elle réutilise les bas niveaux
  génériques déjà présents (`callAnthropic`, `parseJsonResponse`,
  `requireEnv` de `src/lib/ai/providers/http-helpers.ts`) mais ajoute une
  **validation Zod systématique** de chaque sortie IA (aucune sortie LLM
  n'est jamais consommée sans passer par `schema.parse(...)`) et un
  **mode démo déterministe** (`AI_PROVIDER=demo`, comportement par défaut
  du dépôt) pour chaque fonction — jamais un appel réseau requis pour que
  la boucle complète fonctionne en local/CI. `AI_PROVIDER` (variable déjà
  existante, partagée avec le CRM) pilote aussi ce choix ici : un seul
  interrupteur démo/réel pour tout le dépôt, pas un deuxième.
- **Moteur de décision (`getNextBestAction`)** : **déterministe, pas
  IA** — `src/lib/quest/scoring.ts`. L'IA génère des quêtes candidates
  (génération), la logique déterministe choisit laquelle proposer
  maintenant (sélection). Conforme au principe §56 du brief : logique
  déterministe pour scores/statuts/progression/XP/dépendances/filtrage,
  IA pour génération/analyse/adaptation/décomposition.
- **UI** : Personal Quest AI a sa **propre coquille** (`src/app/(quest)/quest/layout.tsx`),
  pas la sidebar desktop CRM (`AppShell`/`SidebarNav`) — le brief exige
  explicitement une UX mobile-first à navigation basse (Aujourd'hui /
  Objectifs / Assistant / Progression / Profil), incompatible avec la
  navigation CRM existante. Nouveaux tokens CSS `--color-quest-*` dans
  `globals.css` (même mécanisme `prefers-color-scheme`/`data-theme` que
  les tokens `p360-*` existants), pas de nouveau design system.
- **Pas de nouveau modèle `Task`/`Notification`/`Conversation`/`AuditLog`
  générique** : ces noms existent déjà dans le schéma (CRM). Les
  équivalents Personal Quest AI sont préfixés (`QuestCheckIn` au lieu de
  `DailyCheckIn` n'entre pas en collision mais reste préfixé par
  cohérence, `QuestConversation`, `QuestAuditLog`, etc.).

## Périmètre livré (Phase 1 — Core, Phase 2 — IA du brief, §49-50)

1. Auth (réutilisée) → 2. création d'objectif → 3. analyse IA (questions de
clarification ciblées) → 4. génération des jalons → 5. génération de 2 à 5
quêtes pertinentes → 6. sélection de la meilleure quête
(`getNextBestAction`, scoring documenté) → 7. démarrage → 8. validation →
9. XP → 10. progression pondérée par jalon/impact → 11. feedback
(reporter/trop dur/trop facile/bloqué/remplacer) → 12. adaptation de la
difficulté (`challengeScore`) → 13. mémoire utilisateur à confiance
progressive → 14. génération de la quête suivante tenant compte du
feedback/mémoire → 15. assistant contextuel (chat + actions structurées
Zod : mettre en pause, remplacer une quête, réduire la difficulté,
décomposer).

## Ce qui n'est pas livré dans ce lot (Phases 3-6 du brief)

Conformément au brief lui-même (§49 : « Ne construis PAS immédiatement
tout le produit ») : `Habit`/`HabitCompletion` dédiés (le type `HABIT`
existe sur `Quest`/`QuestType`, un habitude est donc une quête récurrente
gérée manuellement pour l'instant, pas un moteur de récurrence séparé),
notifications, bilan hebdomadaire automatique programmé (le calcul existe
et est appelable, pas de cron), page Insights dédiée (les insights sont
générés et stockés, pas encore d'écran de visualisation séparé de la page
Progression), export de données/suppression de compte dédiés
(suppression en cascade via `onDelete: Cascade` sur `userId` déjà
correcte, pas d'endpoint UI dédié), PWA/offline, notifications push,
décomposition récursive multi-niveaux au-delà d'un niveau de
`parentQuestId`. À faire évoluer une fois la boucle cœur validée en usage
réel, comme demandé par le brief.

## Conséquences

- Positif : une seule base/instance à opérer, aucun nouveau secret à
  gérer, réutilisation de `AIProvider`/erreurs/validation/logs déjà
  éprouvés, cohérence de méthode avec Compta Vellano.
- Négatif : comme Compta Vellano, Personal Quest AI n'est pas déployable
  indépendamment du CRM (même process Next.js, même base) — acceptable
  tant qu'il reste un module interne ; à revisiter s'il devait être vendu
  séparément.
- Le scoping par `userId` (pas `organizationId`) signifie que le module
  ignore complètement le multi-tenant/`Membership`/rôles CRM : un
  administrateur d'organisation n'a par construction aucun accès aux
  quêtes d'un autre membre — c'est le comportement voulu (données
  personnelles), mais ça diffère de tous les autres modules du dépôt qui
  raisonnent par organisation.

## Alternatives écartées

- **`organizationId` sur les modèles `Quest*` (comme Compta Vellano)** :
  écarté — aurait suggéré un partage de données au sein d'une
  organisation qui n'a pas de sens pour un coach personnel (les quêtes de
  l'utilisateur A ne regardent pas l'utilisateur B, même même
  organisation).
- **Réutiliser `src/lib/ai/types.ts` (`AIProvider`) tel quel** : écarté —
  cette interface est spécifique au domaine CRM (`analyzeLead`,
  `generateMessage`, etc.), pas générique. Plutôt que de la dénaturer,
  nouvelle couche `src/lib/quest/ai/` avec des fonctions structurées
  propres au domaine (`goal-analyzer`, `quest-generator`, ...), sur les
  mêmes fondations bas niveau (`callAnthropic`/`parseJsonResponse`).
- **Réutiliser la sidebar CRM (`AppShell`)** : écarté — le brief est
  explicite sur une UX mobile-first à navigation basse, produit destiné à
  un usage quotidien sur téléphone, très différente de l'usage desktop du
  CRM.
