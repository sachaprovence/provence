-- Plans d'abonnement par défaut (v1.0, AR-0062) — données de référence,
-- pas des données de démonstration : doivent exister dans TOUT
-- environnement (dev, préproduction, production) dès l'application des
-- migrations, indépendamment de `npm run db:seed` (données de démo
-- uniquement). `ON CONFLICT DO NOTHING` rend cette migration rejouable
-- sans erreur si les plans existent déjà (ex. ré-application manuelle).

INSERT INTO "Plan" ("id", "key", "name", "maxUsers", "dailySendLimit", "aiMonthlyBudgetUsd", "priceMonthlyUsd", "stripePriceId", "createdAt", "updatedAt")
VALUES
  (
    'plan_starter_default',
    'STARTER',
    'Starter',
    3,
    50,
    10,
    2900,
    NULL,
    now(),
    now()
  ),
  (
    'plan_pro_default',
    'PRO',
    'Pro',
    10,
    500,
    100,
    9900,
    NULL,
    now(),
    now()
  ),
  (
    'plan_enterprise_default',
    'ENTERPRISE',
    'Entreprise',
    100,
    5000,
    NULL,
    29900,
    NULL,
    now(),
    now()
  )
ON CONFLICT ("key") DO NOTHING;
