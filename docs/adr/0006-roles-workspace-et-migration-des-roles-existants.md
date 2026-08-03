# ADR 0006 — Rôles de workspace étendus, additifs aux rôles d'organisation existants

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

La demande impose au minimum 8 rôles au niveau workspace (Owner, Admin,
Manager, Commercial, Opérateur, Comptable, Support, Viewer), alors que
`MembershipRole` (rôle d'organisation existant) n'en a que 3
(`OWNER_ADMIN`, `SALES`, `PROVIDER`), utilisés par l'intégralité des
routes API métier actuelles via `src/lib/permissions.ts`. Contrainte
explicite : ne supprimer ni modifier le comportement d'aucune
fonctionnalité existante.

## Décision

- `MembershipRole` (organisation, existant) **n'est pas modifié** : les 3
  valeurs et tout le code qui les consomme (`isAdmin`, `isSales`,
  `isProvider`, `leadWhereForActor`, toutes les routes API) restent
  strictement inchangés.
- Nouvel enum `WorkspaceRole` : `OWNER`, `ADMIN`, `MANAGER`, `COMMERCIAL`,
  `OPERATOR`, `ACCOUNTANT`, `SUPPORT`, `VIEWER` — utilisé uniquement par
  `WorkspaceMembership` (nouveau modèle, ADR 0005) et le nouveau module de
  permissions `src/lib/workspace-permissions.ts` (additif, n'importe pas
  et ne modifie pas `src/lib/permissions.ts`).
- Migration des memberships existants : chaque `Membership` existant
  reçoit une `WorkspaceMembership` dans le workspace par défaut de son
  organisation, avec un mapping de rôle fixe et documenté :
  - `OWNER_ADMIN` → `OWNER` (accès complet, cohérent avec le rôle actuel).
  - `SALES` → `COMMERCIAL` (correspond au périmètre fonctionnel actuel :
    prospects, séquences, devis).
  - `PROVIDER` → `OPERATOR` (correspond au périmètre actuel : missions,
    territoire).
- Matrice de permissions (`src/lib/workspace-permissions.ts`) : chaque
  rôle expose un ensemble de permissions nommées (`MANAGE_WORKSPACE`,
  `MANAGE_MEMBERS`, `MANAGE_LEADS`, `VALIDATE_MESSAGES`, `MANAGE_FINANCE`,
  `EXECUTE_MISSIONS`, `VIEW_ONLY`…), vérifiée systématiquement côté
  serveur (`requireWorkspacePermission`), jamais côté interface seule.

## Conséquences

- Aucune route existante ne change de comportement : elles continuent
  d'utiliser `MembershipRole`/`permissions.ts` sans modification.
- Le nouveau système de rôles de workspace est disponible immédiatement
  pour les nouvelles routes de gestion de workspace (création,
  invitation, changement de rôle, archivage) introduites dans cette
  phase, et pourra remplacer progressivement `MembershipRole` route par
  route dans une phase ultérieure — pas en bloc.
- Deux systèmes de rôles cohabitent temporairement (organisation et
  workspace) — assumé comme état transitoire, documenté, pas une
  incohérence accidentelle.

## Alternatives écartées

- **Étendre `MembershipRole` directement à 8 valeurs** : écartée — aurait
  nécessité de faire correspondre les 5 nouvelles valeurs aux 40+ routes
  existantes qui ne connaissent que 3 rôles, sans bénéfice réel pour cette
  phase (généralisation du socle, pas encore des modules métier avancés).
