-- Rattrapage (v0.10, AR-0156) : le secret des déclencheurs webhook était
-- jusqu'ici optionnel — cette migration garantit qu'AUCUNE liaison webhook
-- existante ne reste sans secret avant que l'application n'exige
-- désormais une correspondance systématique (voir les routes
-- POST /api/webhooks/workflows/[...] et POST /api/webhooks/automations/[...]).
-- Génère un secret de 64 caractères hexadécimaux (deux UUID aléatoires
-- concaténés, sans tiret) sans dépendre de l'extension pgcrypto.

UPDATE "WorkflowTriggerBinding"
SET "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object(
  'secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
WHERE "triggerKey" = 'webhook.received'
  AND (
    "config" IS NULL
    OR "config"->>'secret' IS NULL
    OR "config"->>'secret' = ''
  );

UPDATE "AutomationTriggerBinding"
SET "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object(
  'secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
WHERE "triggerKey" = 'webhook.received'
  AND (
    "config" IS NULL
    OR "config"->>'secret' IS NULL
    OR "config"->>'secret' = ''
  );
