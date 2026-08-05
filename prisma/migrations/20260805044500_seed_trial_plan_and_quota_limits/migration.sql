-- Plan d'essai + limites d'usage par plan (v1.4, AR-0183) — même principe que
-- la migration `20260803213000_seed_default_plans` (v1.0) : donnée de
-- référence devant exister dans TOUT environnement dès l'application des
-- migrations, pas une donnée de démonstration. `ON CONFLICT DO NOTHING` pour
-- l'insertion du plan TRIAL (rejouable) ; les `UPDATE` sur les plans
-- existants sont idempotents par nature (même valeur à chaque exécution).

INSERT INTO "Plan" ("id", "key", "name", "maxUsers", "dailySendLimit", "aiMonthlyBudgetUsd", "maxAutomationRuns", "maxStorageMb", "maxConnectors", "priceMonthlyUsd", "stripePriceId", "createdAt", "updatedAt")
VALUES
  (
    'plan_trial_default',
    'TRIAL',
    'Essai',
    2,
    10,
    2,
    20,
    100,
    1,
    0,
    NULL,
    now(),
    now()
  )
ON CONFLICT ("key") DO NOTHING;

UPDATE "Plan" SET "maxAutomationRuns" = 200, "maxStorageMb" = 1000, "maxConnectors" = 3 WHERE "key" = 'STARTER';
UPDATE "Plan" SET "maxAutomationRuns" = 2000, "maxStorageMb" = 10000, "maxConnectors" = 10 WHERE "key" = 'PRO';
UPDATE "Plan" SET "maxAutomationRuns" = NULL, "maxStorageMb" = NULL, "maxConnectors" = NULL WHERE "key" = 'ENTERPRISE';
