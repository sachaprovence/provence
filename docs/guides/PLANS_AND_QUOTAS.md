# Gérer les plans et les quotas

## Les plans

Quatre plans de référence (`Plan`, table gérée par migration, jamais
modifiable depuis l'application) :

| Plan | Usage prévu | Utilisateurs max |
|---|---|---|
| **TRIAL** | Essai — limites volontairement basses | voir `/api/plans` |
| **STARTER** | Petite équipe | — |
| **PRO** | Équipe commerciale établie | — |
| **ENTERPRISE** | Grand compte, usage élevé | — |

Chaque plan définit, en plus du nombre maximal d'utilisateurs
(`maxUsers`) déjà existant depuis la v1.0 :

- **Exécutions d'automatisation** (`maxAutomationRuns`, glissant sur 30
  jours) — `null` = illimité.
- **Stockage des pièces jointes** (`maxStorageMb`) — `null` = illimité.
- **Connecteurs** (`maxConnectors`, un connecteur déjà configuré peut
  toujours être reconfigué même à la limite) — `null` = illimité.
- Les limites déjà existantes depuis la v1.0/v0.9 bis : envois d'email
  quotidiens (`dailySendLimit`), budget IA mensuel (`aiMonthlyBudgetUsd`).

Voir `GET /api/plans` pour la liste à jour (utilisée par la page
d'inscription et l'écran de facturation).

## Consulter son usage

`/automations` affiche, pour l'organisation courante : membres,
exécutions d'automatisation (30 derniers jours), stockage, connecteurs —
chacun avec son usage actuel, sa limite, et un statut (`ok`/`warning`/
`exceeded`).

## Comportement aux limites

- **Avant 80 % d'une limite** : aucune action, aucun blocage.
- **À partir de 80 %** : une notification interne (voir la cloche de
  notifications) est envoyée une fois par organisation et par dimension,
  sur une fenêtre de 24h (jamais un déluge de notifications identiques).
- **À la limite** : l'action correspondante échoue explicitement (erreur
  429, message indiquant la limite atteinte et le plan actuel) — jamais un
  blocage silencieux :
  - déclencher une nouvelle exécution d'automatisation,
  - téléverser une pièce jointe qui dépasserait le quota de stockage,
  - configurer un nouveau type de connecteur au-delà de la limite
    (reconfigurer un connecteur déjà en place reste toujours possible).
  - inviter un nouveau membre au-delà de `maxUsers` (comportement déjà
    existant depuis la v1.0).

Une organisation sans plan assigné (`planId` nul) n'est jamais bloquée
(comportement additif, cohérent avec les quotas email/IA déjà existants).

## Changer de plan

Deux façons, selon le contexte :

- **Le client lui-même**, depuis `/settings/billing` (choix de plan,
  branché sur Stripe réel ou le fournisseur démo — voir
  [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)).
- **Un administrateur plateforme**, manuellement, depuis
  `/admin/organizations/<id>` (voir
  [PLATFORM_ADMINISTRATION.md](./PLATFORM_ADMINISTRATION.md)) — utile pour
  un ajustement ponctuel (ex. geste commercial, dépannage) sans passer par
  le parcours de facturation du client. Toujours journalisé.

Changer de plan met à jour immédiatement les quotas de l'organisation
(`applyPlanToOrganization`) — aucun délai de propagation.
