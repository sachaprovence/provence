# Démarrage : créer une organisation, inviter son équipe, l'onboarding guidé

Pour installer et lancer le projet (Docker ou local), voir le
[README principal](../../README.md#démarrage-rapide-docker) — non
dupliqué ici.

## Créer une organisation

Une organisation se crée uniquement via l'inscription publique
(`/register`) : nom de l'organisation, prénom/nom, email, mot de passe, et
choix d'un plan (voir [PLANS_AND_QUOTAS.md](./PLANS_AND_QUOTAS.md)). Le
premier utilisateur devient automatiquement `OWNER_ADMIN` de l'organisation
et `OWNER` de son workspace par défaut. Il n'existe pas de création
d'organisation "à la main" depuis l'application au-delà de l'inscription —
un utilisateur qui doit administrer plusieurs organisations distinctes
crée un compte par organisation (email différent).

À l'inscription, l'utilisateur est redirigé vers `/onboarding` : le
parcours guidé décrit ci-dessous.

## Le parcours d'onboarding guidé (6 étapes)

Remplace, depuis la v1.4, le formulaire unique de profil d'entreprise.
Chaque étape peut être quittée et reprise plus tard (progression
persistée par organisation — un coéquipier invité en cours de route voit
exactement la même progression) :

1. **Profil** — les informations de l'entreprise (activité, zones
   d'intervention, ton de communication, signature email...), pré-remplies
   depuis l'inscription.
2. **Équipe** — inviter des coéquipiers (facultatif, voir ci-dessous).
3. **Outils** — connecter les premières intégrations (facultatif ; toutes
   ont un repli en mode démo fonctionnel, voir `/settings`).
4. **Modèle** — choisir un modèle d'automatisation à cloner et activer
   dans son workspace (voir
   [AUTOMATION_TEMPLATES.md](./AUTOMATION_TEMPLATES.md)).
5. **Démonstration** — déclencher immédiatement le modèle choisi.
6. **Résultat** — voir le statut réel de cette exécution de démonstration
   (`SUCCEEDED`/`FAILED`), avec un lien vers son détail complet.

Ce parcours peut être quitté à tout moment (le reste de l'application
reste accessible) et repris depuis `/onboarding`.

## Inviter des utilisateurs

Deux niveaux distincts, à ne pas confondre :

- **Invitation à un workspace** (`InviteUserForm`, étape "Équipe" de
  l'onboarding ou page `/users`) : email + rôle de workspace (`OWNER`,
  `ADMIN`, `MANAGER`, `COMMERCIAL`, `OPERATOR`, `ACCOUNTANT`, `SUPPORT`,
  `VIEWER`). Un email réel est envoyé (ou, en mode démo sans fournisseur
  configuré, le lien d'invitation est affiché directement) ; le lien
  expire après 7 jours et peut être révoqué avant acceptation. Si la
  personne invitée a déjà un compte Autorun (potentiellement dans une
  autre organisation), elle reçoit aussi une notification in-app.
- **Rôle d'organisation** (`OWNER_ADMIN`/`SALES`/`PROVIDER`, page
  `/users`, réservé à un `OWNER_ADMIN`) : gouverne des permissions plus
  larges que le rôle de workspace (accès à la facturation, gestion des
  membres). Modifiable depuis le tableau des membres, avec :
  - **Transfert de propriété** — désigne un autre membre comme nouvel
    `OWNER_ADMIN` ; l'acteur qui transfère redevient automatiquement
    `SALES`. Irréversible sans qu'un `OWNER_ADMIN` (l'ancien ou le
    nouveau) ne le refasse en sens inverse.
  - **Retrait définitif d'un membre** — supprime son accès à
    l'organisation ET à tous ses workspaces (jamais son compte
    utilisateur lui-même, qui peut appartenir à d'autres organisations).
    Impossible de retirer le dernier `OWNER_ADMIN` — transférer d'abord
    la propriété.

Toute modification de rôle, activation/désactivation, transfert de
propriété ou retrait de membre est journalisée dans les journaux d'audit
de l'organisation.
