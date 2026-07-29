# ADR 0005 — Modèle multi-tenant : Organization (inchangée) + Workspace (nouveau) + rôles étendus

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

La v0.2 doit généraliser Autorun vers un modèle multi-tenant explicite
(Organisation, Workspace, appartenance, rôles, permissions), en préservant
intégralement Provence 360 comme premier workspace réel, sans réécriture
brutale du code métier existant (`Lead`, `Campaign`, `Sequence`, `Quote`,
`Mission`…), tous actuellement scopés par `Organization.id`.

Deux stratégies ont été mises en balance :

1. **Renommer** le modèle `Organization` existant en `Workspace`, et
   introduire un nouveau modèle `Organization` au-dessus. Fidèle au
   vocabulaire de la demande, mais force un renommage mécanique de
   `prisma.organization` → `prisma.workspace` et du type `Organization` →
   `Workspace` dans une quarantaine de fichiers (toutes les routes API
   métier, `auth.ts`, `permissions.ts`, les relations Prisma nommées
   `organization` sur la quasi-totalité des modèles). Un renommage reste un
   changement à fort risque (occurrence oubliée, forme de réponse JSON
   modifiée pour le frontend existant) même sans migration SQL.
2. **Ne rien renommer** : `Organization` reste le nom du modèle et de la
   table (aucune migration, aucun fichier métier existant modifié) et joue
   le rôle de frontière multi-tenant **primaire**, exactement comme
   aujourd'hui. `Workspace` est ajouté comme **sous-espace optionnel à
   l'intérieur d'une organisation** — ce que la demande elle-même autorise
   explicitement : *"chaque donnée métier doit être rattachée à une
   organisation et, **lorsque pertinent**, à un workspace"*.

## Décision

Option 2. Concrètement :

- `Organization` (inchangé, zéro migration sur les 30+ tables qui la
  référencent déjà) reste la frontière multi-tenant principale, déjà
  éprouvée et déjà isolée dans tout le code existant.
- Nouveau modèle `Workspace` (`organizationId` FK, `name`, `slug` unique
  par organisation, `isDefault`, `archivedAt`/`archivedById`) : un
  sous-espace de travail à l'intérieur d'une organisation. Chaque
  organisation existante (Provence 360 comprise) reçoit **exactement un**
  workspace par défaut (`isDefault: true`) lors de la migration — rien
  n'empêche d'en créer d'autres ensuite.
- Nouveau modèle `WorkspaceMembership` (`workspaceId`, `userId`, rôle parmi
  `WorkspaceRole` — voir ADR 0006) : appartenance à un workspace,
  **additive** par rapport à `Membership` (appartenance à l'organisation,
  inchangée, toujours utilisée par tout le code existant). Une migration
  crée automatiquement, pour chaque `Membership` existant, une
  `WorkspaceMembership` correspondante dans le workspace par défaut de son
  organisation (mapping de rôle documenté dans ADR 0006).
- Le workspace actif d'une session est stocké **côté serveur**
  (`Session.activeWorkspaceId`), jamais dans un identifiant envoyé tel
  quel par le client sans re-vérification de l'appartenance
  (`WorkspaceMembership`) à chaque lecture/écriture.
- Champ `workspaceId` (nullable) ajouté à `Lead` uniquement dans cette
  phase, comme preuve de concept du scoping par workspace et support des
  tests d'isolation inter-workspace exigés. Les autres tables métier
  (`Campaign`, `Sequence`, `Quote`…) restent scopées par `organizationId`
  seul pour l'instant — l'isolation reste correcte (un seul workspace par
  défaut par organisation aujourd'hui), leur passage à un scoping par
  workspace explicite est différé et sera traité table par table au fil de
  `MOD-02` (`ROADMAP.md`), pas en bloc dans cette phase.

## Conséquences

- Zéro migration de données à risque sur les tables métier existantes ;
  aucune route API métier existante n'est modifiée.
- Le vocabulaire produit (« Provence 360 est un workspace ») et le
  vocabulaire du schéma (« Provence 360 est une `Organization` qui
  possède un `Workspace` par défaut ») diffèrent légèrement — assumé et
  documenté ici plutôt que cause de confusion silencieuse. Toute UI
  utilisateur affiche « Workspace », jamais « Organization ».
- Un renommage complet (`Organization` → `Workspace` au sens strict du
  vocabulaire) reste possible plus tard, en changement dédié, isolé,
  entièrement mécanique — pas mélangé à une évolution fonctionnelle.
- L'isolation multi-tenant réelle (celle qui protège les données) continue
  à reposer sur `organizationId`, déjà éprouvée ; `workspaceId` est une
  granularité additionnelle, pas un remplacement.

## Alternatives écartées

- **Renommer `Organization` → `Workspace`** : écartée pour cette phase —
  contredit directement la consigne de ne pas réécrire brutalement le code
  métier existant, pour un bénéfice principalement terminologique.
- **Ajouter `workspaceId` à toutes les tables métier immédiatement** :
  écartée — risque de migration disproportionné par rapport au besoin réel
  actuel (une seule organisation active, un seul workspace par défaut) ;
  reportée table par table selon la feuille de route.
