# Administrer la plateforme

Distinct de toute administration d'organisation cliente (`OWNER_ADMIN`) :
l'administration plateforme traverse TOUTES les organisations, réservée à
un compte marqué `User.isPlatformAdmin`.

## Devenir administrateur plateforme

Jamais réglable depuis l'application (aucune route, aucun formulaire) —
uniquement par un opérateur ayant un accès direct au serveur/à la base :

```bash
npx tsx scripts/promote-platform-admin.ts <email>
# pour révoquer :
npx tsx scripts/promote-platform-admin.ts <email> --revoke
```

Une fois promu, se reconnecter (ou recharger la session) puis se rendre
sur `/admin`.

## Ce que l'interface d'administration permet

- **`/admin`** — vue d'ensemble : nombre d'organisations, nombre
  d'utilisateurs, répartition par statut d'abonnement, taux d'erreur API
  global (toutes organisations confondues, dernière semaine).
- **`/admin/organizations`** — liste et recherche des organisations
  (plan, statut d'abonnement, nombre de membres).
- **`/admin/organizations/<id>`** — détail d'une organisation : membres,
  usage vs plan (mêmes dimensions que dans
  [PLANS_AND_QUOTAS.md](./PLANS_AND_QUOTAS.md)), et trois actions :
  - **Changer de plan** — applique immédiatement le nouveau plan et ses
    quotas.
  - **Suspendre** — bascule l'organisation en statut `RESTRICTED` (la même
    sémantique qu'un échec de paiement Stripe réel : écritures bloquées,
    lecture toujours possible).
  - **Réactiver** — repasse l'organisation en `ACTIVE`.
- **`/admin/users`** — liste et recherche des utilisateurs (organisations
  d'appartenance, statut administrateur plateforme).
- **`/admin/audit-logs`** — journal d'audit, filtrable par organisation ;
  inclut à la fois les actions des clients dans leur organisation ET les
  actions d'administration plateforme elles-mêmes.

**Chaque action d'administration (changement de plan, suspension,
réactivation) est systématiquement journalisée** dans les journaux
d'audit de l'organisation concernée, avec l'identifiant de
l'administrateur plateforme qui l'a réalisée.

## Ce qui n'est délibérément PAS exposé ici

Les métriques de sauvegarde de la base de données (statut, horodatage,
taille) restent **CLI uniquement**
(`npm run backup:metrics-report`, voir `docs/operations/`) — un réglage de
déploiement, pas une préoccupation par organisation cliente, jamais
exposé via un endpoint web accessible en pratique par un client.
