# ADR 0048 — Compta Vellano : module de comptabilité pizzeria isolé dans le dépôt Autorun

- **Date** : 2026-08-05
- **Statut** : accepté

## Contexte

Demande directe du client (hors `BACKLOG.md`/`ROADMAP.md` existants) : livrer
une application de comptabilité simplifiée pour une pizzeria familiale
("Compta Vellano" — ventes, dépenses, produits, fournisseurs, caisse, TVA,
tableau de bord, avec un scanner OCR/IA et un assistant IA prévus pour plus
tard). Le dépôt héberge aujourd'hui **Autorun / Provence 360**, une
plateforme SaaS multi-tenant CRM/automatisation sans rapport métier avec la
comptabilité d'une pizzeria.

Deux options structurantes se posaient :

1. Un dépôt/projet séparé, stack au choix.
2. Un module isolé à l'intérieur de ce dépôt, réutilisant l'infrastructure
   déjà en place (Postgres, Prisma, authentification par session,
   observabilité, sauvegardes, CI/CD, kit UI).

Le client a explicitement demandé l'option 2 : réutiliser l'infrastructure
existante plutôt que dupliquer un socle technique complet pour un besoin
métier ponctuel, tout en garantissant qu'aucune donnée ni aucun code ne
soit partagé entre Compta Vellano et le CRM Provence 360.

## Décision

- Compta Vellano vit **dans le même schéma Prisma** que Provence 360, avec
  des modèles strictement préfixés `Compta*` (`ComptaProduct`, `ComptaSale`,
  `ComptaSaleLine`, `ComptaSupplier`, `ComptaExpense`, `ComptaCashCount`),
  sans aucune relation Prisma vers `Lead`/`Company`/`Quote`/etc. du CRM.
- Chaque modèle est scopé par `organizationId` (le mécanisme multi-tenant
  déjà en place), avec `workspaceId` optionnel pour rester compatible avec
  le multi-workspace existant sans l'imposer.
- Réutilisation stricte des couches transverses existantes plutôt que
  duplication : authentification (`requireActor`/`requireActorApi`),
  gestion d'erreurs (`AppError`/`toApiErrorResponse`), journal d'audit
  (`writeAuditLog`), logger structuré (`pino`), kit UI
  (`src/components/ui`, classes `.card`/`.btn-primary`/`.input`), Recharts
  pour les graphiques.
- Montants stockés en **centimes (`Int`), TTC** — même convention que
  `Quote`/`Invoice`. La TVA est extraite d'un montant TTC via
  `montant × taux / (100 + taux)` (`src/lib/compta/money.ts`), jamais
  ajoutée à un montant HT (les prix pizzeria sont affichés/saisis TTC).
- Sous-fonctionnalités non livrées dans ce premier lot (scanner OCR/IA,
  assistant IA) : pages présentes avec un état "bientôt disponible"
  (`src/app/(app)/compta/scanner`, `.../assistant`), gardées derrière des
  variables d'environnement dédiées (`COMPTA_OCR_ENABLED`,
  `COMPTA_AI_ASSISTANT_ENABLED`, défaut `false`) plutôt qu'un
  `if (vertical === ...)` en dur — même discipline que §8 de
  `DEVELOPMENT_GUIDE.md`.
- Le schéma anticipe ces extensions sans migration destructrice prévisible :
  `ComptaProduct.aliases` (reconnaissance OCR future), `ComptaSaleLine.productId`
  nullable (ligne libre ou reconnue), photo de facture/ticket via le modèle
  `Attachment` générique déjà existant (`entityType = "ComptaExpense"` /
  `"ComptaSale"`), pas un nouveau modèle de stockage dédié.

## Conséquences

- Positif : une seule base de données/instance à opérer, sauvegardes et
  CI/CD déjà couverts, aucun nouveau `AUTH_SECRET`/session à gérer, cohérence
  visuelle avec le reste de l'application.
- Négatif : Compta Vellano n'est pas déployable indépendamment de Provence
  360 (même process Next.js, même base) — acceptable pour un module interne
  à un seul client, à revisiter si Compta Vellano devait un jour être vendu
  à d'autres établissements indépendamment d'Autorun.
- Le rôle `MembershipRole` (organisation) n'a pas de rôle dédié
  "comptable" — la navigation restreint les pages sensibles (dépenses,
  fournisseurs, caisse, TVA) à `OWNER_ADMIN`, et les ventes à
  `OWNER_ADMIN`/`SALES`. `WorkspaceRole.ACCOUNTANT` existe déjà dans le
  schéma pour un futur contrôle plus fin au niveau workspace, non branché
  ici (même état que le reste du module Finance CRM aujourd'hui).

## Alternatives écartées

- **Dépôt séparé (SQLite/Prisma, shadcn/ui, auth dédiée)**, tel que décrit
  dans la demande initiale : écarté par choix explicite du client au profit
  de la réutilisation d'infrastructure — voir échange précédant ce ADR.
- **Table `Compta*` avec `vertical` discriminant dans les modèles CRM
  existants** (ex. réutiliser `Invoice`/`Service`) : écarté — le cycle de
  vie et les champs (TVA extraite d'un TTC produit pizzeria, comptage de
  caisse billets/pièces) n'ont rien à voir avec la facturation B2B du CRM ;
  forcer une réutilisation aurait ajouté des champs optionnels non-sens
  des deux côtés plutôt que clarifié le modèle.
