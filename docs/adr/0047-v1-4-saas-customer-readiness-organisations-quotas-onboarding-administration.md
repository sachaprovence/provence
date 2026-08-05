# ADR 0047 — v1.4 : préparation commerciale SaaS (organisations, quotas, onboarding, administration)

- **Statut** : Acceptée
- **Date** : 2026-08-05
- **Portée** : décisions d'implémentation transverses aux 10 axes de la v1.4 (branche `claude/autorun-v1.4-customer-readiness`, base : `main` après fusion de la PR #11 / v1.3, commit `ed09ba9`).

## Contexte

v1.3 a rendu Autorun techniquement prêt pour la production (intégrations
réelles, durcissement, monitoring, reprise après sinistre). v1.4 vise un
objectif différent : transformer cette plateforme techniquement prête en
un produit qu'un premier client pilote peut réellement utiliser,
administrer, et payer — sans qu'un opérateur humain n'ait à intervenir
manuellement en base de données pour chaque nouvelle organisation.

Principe directeur explicite de cette passe : **auditer l'existant et
réutiliser avant de créer**. Chacune des décisions ci-dessous documente
donc, en premier lieu, ce qui existait déjà et pourquoi une nouvelle
architecture parallèle n'a PAS été créée.

## Décision — Organisations/équipes : deux systèmes de rôles préexistants, jamais fusionnés

Le dépôt a DEUX systèmes de rôles indépendants, nés à des moments
différents (voir ADR 0005/0006) : `Membership`/`MembershipRole`
(organisation : `OWNER_ADMIN`/`SALES`/`PROVIDER`, utilisé par
`src/lib/permissions.ts`) et `WorkspaceMembership`/`WorkspaceRole`
(workspace : `OWNER`/`ADMIN`/`MANAGER`/`COMMERCIAL`/`OPERATOR`/
`ACCOUNTANT`/`SUPPORT`/`VIEWER`, utilisé par
`src/lib/workspace-permissions.ts`). v1.4 ne les fusionne pas — un tel
chantier serait une migration de données à haut risque sans rapport avec
l'objectif de cette passe — et étend chacun séparément là où le besoin
l'exige :

- **Transfert de propriété d'organisation** (`transferOrganizationOwnership`,
  `src/lib/organization-service.ts`) : opère sur `MembershipRole`
  (organisation), jamais sur `WorkspaceRole`. Atomique (transaction) : la
  cible devient `OWNER_ADMIN`, l'acteur redevient `SALES` — jamais d'état
  intermédiaire à zéro ou deux administrateurs.
- **Retrait définitif d'un membre** (`removeOrganizationMember`) : supprime
  la `Membership` d'organisation ET toutes les `WorkspaceMembership` de
  cette organisation (jamais le `User` lui-même — peut appartenir à
  d'autres organisations, et son historique d'auteur doit rester
  consultable). Garde-fou non contournable : jamais retirer le dernier
  `OWNER_ADMIN`. Vérifie désormais elle-même le rôle de l'acteur
  (`ForbiddenError` si non `OWNER_ADMIN`) — défense en profondeur ajoutée
  après revue de la v1.4-2 (voir plus bas), en plus de la garde déjà
  posée par la route `DELETE /api/users/[id]` (`canManageUsers`).

## Décision — Permissions/sécurité : pas de nouveau système, une revue systématique de l'existant

Aucun nouveau moteur d'autorisation n'a été introduit : `permissions.ts`
et `workspace-permissions.ts` restent les deux points d'entrée uniques.
La revue v1.4-2 a porté sur trois choses :

1. **Garde plateforme (`assertPlatformAdmin`)** : testée directement
   (throw/pass), plutôt que retraversée à travers `getCurrentActor()`
   (dépend de `next/headers`, non rejouable hors contexte de requête —
   voir la décision Administration ci-dessous). Les 8 routes
   `/api/admin/**` ont été relues une à une : chacune appelle
   `requirePlatformAdminApi()` avant tout appel de service, sans
   exception.
2. **Isolation des actions d'administration** : contrairement au reste de
   l'application (toujours scopé à `actor.organization.id`), l'admin
   plateforme traverse volontairement TOUTES les organisations par
   conception. L'isolation à vérifier n'est donc pas « jamais voir une
   autre organisation » mais « une action ciblant l'organisation A ne
   modifie/ne lit jamais l'organisation B » — `tests/tenant-isolation/
   admin.test.ts` couvre ce scoping pour chaque action (changement de
   plan, suspension, réactivation, détail).
3. **Défense en profondeur incohérente détectée** : `removeOrganizationMember`
   ne vérifiait pas le rôle de l'acteur, alors que sa fonction sœur
   `transferOrganizationOwnership` le fait. Le seul appelant réel (la route
   `DELETE`) vérifiait déjà `canManageUsers`, donc pas de vulnérabilité
   vivante — mais un futur appelant direct aurait pu contourner le
   contrôle par accident. Corrigé par cohérence, avec test dédié.

## Décision — Administrateur plateforme : un attribut `User`, jamais un rôle d'organisation

`isPlatformAdmin` est un booléen sur `User` (jamais sur `Membership`) :
un administrateur plateforme n'appartient à aucune organisation cliente
en cette qualité, il les traverse toutes. Jamais réglable depuis
l'application (aucune route, aucun formulaire) — uniquement via un script
CLI (`scripts/promote-platform-admin.ts`), même convention que
`scripts/prune-old-backups.ts` (action opérateur ponctuelle, hors
périmètre applicatif). `CurrentActor`/`WorkspaceActor` gagnent le champ ;
`WorkspaceActor extends CurrentActor` par spread, donc `getCurrentActor()`
le propage automatiquement partout où un acteur réel est construit — seuls
les fixtures de test construits à la main ont nécessité une mise à jour
explicite (6 fichiers).

`requirePlatformAdminPage`/`requirePlatformAdminApi` (`src/lib/
platform-admin.ts`) suivent exactement la convention déjà établie par
`requireActor`/`requireActorApi` — page (redirect) vs API (403 JSON).
`assertPlatformAdmin` est la troisième variante (lève, pour un contexte
déjà authentifié) : c'est la seule des trois testable sans dépendance à
`next/headers`, d'où son usage dans les tests d'isolation plutôt qu'une
tentative de mock de `cookies()`.

## Décision — Onboarding guidé : un modèle par organisation, jamais par utilisateur

`OnboardingProgress` (une ligne par organisation, unique sur
`organizationId`) plutôt que par utilisateur : un coéquipier invité en
cours de route doit voir exactement la même progression que celui qui l'a
commencée — l'onboarding est une propriété de l'organisation, pas de la
session qui l'a initiée. `OnboardingStepKey` (6 étapes fixes, jamais de
saut, jamais en arrière) plutôt qu'un champ texte libre : rend l'ordre
impossible à violer par construction.

Chaque étape RÉUTILISE un système déjà existant :
- PROFILE → le formulaire d'organisation déjà existant (`OrganizationForm`).
- INVITE_TEAM → `inviteWorkspaceMember` (v1.0, invitations par email déjà
  fonctionnelles).
- CONNECT_TOOL → renvoie vers `/settings` (intégrations déjà existantes,
  chacune avec un repli démo fonctionnel).
- CHOOSE_TEMPLATE + LAUNCH_DEMO → le pipeline clone/active/déclenche de
  l'Automation Engine (v0.9), avec une clé de clone déterministe
  (`<template>-onboarding-<organisation>`) : revenir à cette étape et
  choisir de nouveau réutilise le clone déjà créé plutôt que d'échouer sur
  une clé déjà prise (idempotent par construction, jamais par
  vérification a posteriori).

**Bogue découvert pendant l'implémentation** : `advanceAutomationRun` ne
fait progresser que l'état du graphe (dispatche les nœuds d'action en
créant des lignes `AutomationJob` en file) — exécuter réellement un job
déjà mis en file nécessite un appel séparé à `processAutomationJobs`
(le noyau de jobs). La première version de `launchOnboardingDemo`
n'appelait que `advanceAutomationRun` en boucle, restant bloquée
indéfiniment à `RUNNING`. Corrigé en ajoutant l'appel manquant à la boucle
d'avancement — exactement le même schéma que `driveToTerminal` (l'aide de
test déjà existante pour les templates d'automatisation, v0.9), qui aurait
dû être le premier point de référence.

## Décision — Modèles métier prêts à l'emploi : 4 nouveaux templates, aucune nouvelle architecture

L'architecture de clonage de template (v0.9) était déjà exactement ce que
demandait cet axe : templates globaux (`organizationId`/`workspaceId`
nuls, `isTemplate=true`), jamais activables directement, clonables dans un
workspace via `cloneAutomationDefinition`. v1.4 ajoute 4 templates
(qualification de demande entrante, résumé quotidien, prospect
prioritaire, tâche de suivi automatique) et 2 nouvelles actions
(`task.create`, `report.daily_summary`) au registre existant de gestionnaires
(`AutomationJobHandler`) — jamais un second registre. Le nouvel évènement de
domaine `lead.became_priority` est délibérément gardé SÉPARÉ du mécanisme
existant `onLeadScoreComputed` (création de tâche par organisation) plutôt
que fusionné avec lui — les deux restent indépendamment opt-in, pour ne
jamais dupliquer/entrer en conflit avec un comportement existant, testé, en
production.

## Décision — Quotas/usage : nouvelles colonnes sur `Plan`, appliquées au point d'exécution, jamais a posteriori

`Plan` gagne `maxAutomationRuns`/`maxStorageMb`/`maxConnectors` (nullables
= illimité, cohérent avec `dailySendLimit`/`aiMonthlyBudgetUsd` déjà
nullables sur `Organization` depuis v1.0). `computeOrganizationUsage`
(nouveau, `src/lib/billing/usage-service.ts`) calcule l'usage réel par
dimension ; `assertAutomationRunAllowed`/`assertStorageAvailable`/
`assertConnectorLimitAvailable` (nouveau, `quota-enforcement.ts`) lèvent
`QuotaExceededError` (429, réutilisé tel quel depuis les quotas IA/email
existants) au point de création réel (`createAutomationRun`, upload de
pièce jointe, connexion d'un nouvel intégrateur) — jamais un job de fond
qui purgerait après coup. Un connecteur déjà configuré peut toujours être
reconfiguré même à la limite (ne compte jamais comme un nouveau
connecteur) : bloquer un client qui ne fait que corriger ses identifiants
existants serait un comportement hostile, pas une protection.

Nouveau plan **TRIAL** (`PlanKey`), avec des limites volontairement basses
pour rendre les quotas observables/testables sans attendre un vrai usage
en production. Notification de dépassement imminent (`notifyQuotaWarningOnce`,
80 % du seuil) dédoublonnée sur 24h par organisation/dimension — jamais un
déluge de notifications identiques.

**Conçu explicitement pour Stripe sans réécriture majeure** (voir
`docs/guides/STRIPE_INTEGRATION.md`) : `applyPlanToOrganization` est déjà
le point d'entrée unique qui copie les quotas d'un `Plan` sur une
`Organization`, que l'appelant soit une action manuelle d'administration
(v1.4) ou un futur webhook Stripe `checkout.session.completed`/
`customer.subscription.updated` (l'abstraction `BillingProvider`,
`StripeBillingProvider` réel vs `DemoBillingProvider`, existe déjà depuis
v1.0/AR-0063) — aucune nouvelle table, aucun nouveau chemin de code à
inventer le jour où un vrai compte Stripe est configuré.

## Décision — Notifications : le modèle `Notification` existait déjà (émission), il manquait la boîte de réception (lecture)

Workflow/Automation Engine créaient déjà des `Notification` depuis v0.6/
v0.8, mais rien ne les listait ni ne les marquait comme lues — un modèle
écrit, jamais lu. v1.4 ajoute `listNotifications`/`countUnreadNotifications`/
`markNotificationRead`/`markAllNotificationsRead`
(`src/lib/notifications/notification-service.ts`), une cloche dans la
barre latérale (`notification-bell.tsx`), et 3 nouveaux évènements
déclenchés par le code v1.4 lui-même (invitation reçue, avertissement de
quota, action administrative) — jamais un nouveau modèle de données,
jamais un second bus d'évènements. `NotificationPreference` (existant)
est respecté pour les notifications CIBLÉES, jamais pour les diffusions
larges (`broadcastNotification`) : une organisation entière ne doit pas
pouvoir se rendre collectivement aveugle à une diffusion de portée
administrative en désactivant une préférence individuelle.

## Décision — Administration plateforme : `SubscriptionStatus.RESTRICTED` réutilisé, jamais un nouveau statut

Suspendre une organisation depuis l'administration réutilise exactement
l'état déjà produit par un échec de paiement Stripe (`RESTRICTED`,
existant depuis v1.0) plutôt que d'introduire un nouveau statut
`SUSPENDED` — même sémantique (écriture bloquée, lecture toujours
possible, voir `src/proxy.ts`), un seul état à raisonner pour tout code
qui vérifie déjà `subscriptionStatus`. `getGlobalErrorSummary` réutilise
`ApiRequestMetric` (déjà collecté depuis v0.9 bis/AR-0049), agrégé sans
filtre d'organisation — la seule vue de tout le dépôt qui traverse
délibérément toutes les organisations pour une métrique d'erreur, jamais
répliquée ailleurs.

## Conséquences

- Toute nouvelle route sous `/api/admin/**` DOIT appeler
  `requirePlatformAdminApi()`/`requirePlatformAdminPage()` avant tout
  appel de service — les fonctions de `admin-service.ts` ne revérifient
  jamais elles-mêmes ce garde (voir leur commentaire d'en-tête), la revue
  de code reste donc le seul filet pour cette convention précise.
- Toute nouvelle dimension de quota DOIT suivre le patron
  `assert*Available`/`QuotaExceededError` posé ici — jamais un blocage
  silencieux ou un job de purge a posteriori.
- Un futur webhook Stripe réel n'a besoin d'appeler qu'`applyPlanToOrganization`
  — aucune nouvelle table de mapping plan↔quotas à inventer.
- `docs/guides/` (nouveau) documente, du point de vue de l'opérateur ET du
  client, les 8 sujets demandés par cette passe (installation, création
  d'organisation, invitation, configuration d'un modèle, gestion des
  quotas, administration, préparation Stripe, diagnostic d'erreurs
  courantes).
