# Guide d'onboarding du premier client réel (v1.3, AR-0177)

Ce document s'adresse à l'OPÉRATEUR (l'équipe qui exploite Autorun), pas
au client final — pour le parcours d'inscription en libre-service côté
client, voir `tests/e2e/self-service-onboarding.mjs` (déjà fonctionnel
depuis v1.0, AR-0064) et `/register`. Ce guide couvre ce qui reste à
faire manuellement AVANT de laisser un premier client réel utiliser
l'application en conditions réelles (données réelles, paiements réels,
emails réels envoyés à de vrais destinataires).

## Pourquoi ce document existe

`npm run integrations:validate` (v1.3, AR-0172) rapporte honnêtement
`NOT_CONFIGURED` pour Stripe/Gmail/Outlook/S3/Twilio dans cet
environnement de développement — aucune de ces intégrations n'a été
validée contre un compte réel ou un sandbox officiel (voir
`docs/release/integration-validation-evidence-v1.3.md`). **Ce n'est pas
un défaut du produit — c'est une action opérateur qui reste à faire**,
documentée ici étape par étape.

## Étape 0 — Confirmer la préparation technique

- [ ] `DEPLOYMENT_CHECKLIST.md` entièrement coché sur l'environnement de
      production cible.
- [ ] `RUNBOOK.md` lu par au moins une personne d'astreinte.
- [ ] `INCIDENT_RESPONSE.md` lu par au moins une personne d'astreinte.

## Étape 1 — Choisir et valider les intégrations réellement nécessaires

Toutes les intégrations ont un repli `demo` fonctionnel — n'activer QUE
celles réellement utilisées par ce premier client, jamais tout activer
par précaution.

| Intégration | Nécessaire si... | Comment valider |
|---|---|---|
| **Stripe** (facturation) | Le client paie un abonnement réel (`BILLING_PROVIDER=stripe`). | Mode TEST Stripe d'abord (jamais live directement) : configurer `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` de test, créer un abonnement de test de bout en bout, confirmer la réception du webhook (`POST /api/billing/webhook`). Basculer en clés live seulement après un cycle de facturation de test réussi. |
| **Email réel** (Gmail/Outlook/SMTP/Resend/Postmark/Brevo) | Le client envoie des relances/communications à de vrais prospects. | Configurer depuis `/settings` (par organisation) ; envoyer un email de test à une adresse que l'opérateur contrôle avant tout envoi à un vrai prospect du client. |
| **Stockage S3** | Le client téléverse des pièces jointes qui doivent survivre à un redéploiement. | `STORAGE_PROVIDER=s3` + les 4 variables requises (`ENVIRONMENT_VARIABLES.md`) ; tester un cycle upload/download/delete réel avant la mise à disposition du client. |
| **Twilio** (SMS) | Le client envoie des SMS. | Compte Twilio réel, configuré par organisation depuis `/settings`. |
| **Google Calendar** | Le client synchronise ses rendez-vous. | `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` (app Google Cloud), puis connexion OAuth par l'utilisateur final depuis `/settings`. |

Après configuration de chaque intégration choisie, réexécuter
`npm run integrations:validate -- <organizationId>` pour confirmer
`CONFIGURED` + `TEST_SUCCESS` avant de considérer l'étape terminée.

## Étape 2 — Provisionner l'organisation du client

- [ ] Créer l'organisation (auto-service via `/register`, ou manuellement
      si un accompagnement personnalisé est prévu).
- [ ] Choisir le plan d'abonnement adapté (`/settings/billing`).
- [ ] Configurer les paramètres de l'entreprise (nom, TVA, logo, signature
      — `/settings`).
- [ ] Créer les comptes utilisateurs des membres de l'équipe du client
      avec les rôles appropriés.

## Étape 3 — Vérifier l'isolation avant mise à disposition

- [ ] Si ce client n'est pas le seul de la plateforme, confirmer
      l'absence de fuite inter-organisation en conditions réelles
      (`tests/e2e/two-organizations-isolation.mjs` couvre ce cas en CI —
      ici, une vérification manuelle rapide suffit : se connecter en tant
      qu'utilisateur du nouveau client, confirmer qu'aucune donnée d'une
      autre organisation n'apparaît).

## Étape 4 — Communiquer les engagements de service

- [ ] RPO/RTO communiqués si contractuels (`BACKUP_RESTORE.md` §9 — RPO de
      24h avec la planification quotidienne standard ; RTO à mesurer sur un
      volume de données représentatif avant tout engagement chiffré).
- [ ] Canal de support/astreinte communiqué au client.

## Étape 5 — Premier jour en conditions réelles

- [ ] Surveillance renforcée des métriques (`/settings/metrics`) et des
      journaux pendant les premières 24-48h d'utilisation réelle.
- [ ] Confirmer que la première exécution planifiée de sauvegarde après
      la mise en service inclut bien les données de ce client
      (`npm run backup:metrics-report`).

## Ce qui reste volontairement hors périmètre de ce guide

- La négociation commerciale/contractuelle (SLA chiffrés, tarification) —
  propre à chaque client, hors périmètre technique.
- La formation utilisateur final au produit — matériel produit séparé,
  pas un runbook d'exploitation.
