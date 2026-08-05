# Préparer une intégration Stripe réelle

La facturation fonctionne en mode démo par défaut
(`BILLING_PROVIDER="demo"`) : un changement de plan est activé
immédiatement, sans aucune configuration externe — utile pour développer,
faire une démonstration, ou faire tourner un premier pilote sans compte
Stripe réel. L'intégration Stripe réelle existe déjà dans le code
(`StripeBillingProvider`, depuis la v1.0/AR-0063) : passer de l'une à
l'autre est un réglage de déploiement, jamais une réécriture.

## Ce qui existe déjà (rien à développer)

- `BillingProvider` (abstraction, `src/lib/billing/types.ts`) avec deux
  implémentations : `DemoBillingProvider` et `StripeBillingProvider`
  (`src/lib/billing/providers/stripe.ts`) — sélectionnées via
  `BILLING_PROVIDER`.
- `POST /api/billing/webhook` — déjà câblé pour recevoir les évènements
  Stripe réels (signature vérifiée, protection contre le rejeu d'un
  horodatage expiré).
- `Plan.stripePriceId` — champ déjà présent sur chaque plan, pour faire le
  lien entre un plan Autorun et un prix Stripe.
- `/settings/billing` — interface client déjà branchée sur l'abstraction
  (changement de plan, annulation), indépendamment du fournisseur actif.
- Le modèle de quotas v1.4 (`applyPlanToOrganization`, voir
  [PLANS_AND_QUOTAS.md](./PLANS_AND_QUOTAS.md)) est le point d'entrée
  UNIQUE qui applique un plan à une organisation — qu'il soit appelé
  manuellement (administration) ou par un futur webhook Stripe. Aucune
  nouvelle table à créer le jour de la bascule.

## Étapes pour activer Stripe réellement

1. Créer les produits/prix côté Stripe (Starter/Pro/Entreprise — TRIAL
   n'a normalement pas vocation à être facturé).
2. Renseigner `Plan.stripePriceId` pour chaque plan concerné (via
   l'administration ou une migration de données ponctuelle).
3. Configurer un webhook Stripe pointant vers
   `POST /api/billing/webhook`, et renseigner son secret de signature.
4. Renseigner les variables d'environnement (voir `.env.example`) :
   ```
   BILLING_PROVIDER="stripe"
   STRIPE_SECRET_KEY="sk_live_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   ```
5. Redémarrer l'application — `getBillingProvider()` bascule
   immédiatement sur `StripeBillingProvider`, sans redéploiement de code.
6. Vérifier avec `npm run integrations:validate` (voir
   `docs/release/`) que le fournisseur Stripe est bien détecté
   `CONFIGURED` avant tout premier client réel facturé.

## Ce qui reste une action opérateur, jamais automatisée

- La création des produits/prix Stripe eux-mêmes (étape 1) — hors
  périmètre de ce dépôt, à faire depuis le tableau de bord Stripe.
- Le choix du moment de bascule `demo` → `stripe` : les deux fournisseurs
  cohabitent dans le code, mais un seul est actif par déploiement (jamais
  par organisation) — cohérent avec le principe déjà établi pour
  email/IA/stockage : le CHOIX du fournisseur est un réglage de
  déploiement.
