import { Client } from "pg";

/**
 * Cycle de vie d'une base PostgreSQL temporaire — extrait de
 * `scripts/test-migrations-fresh-db.ts` (AR-0163) pour être réutilisé tel
 * quel par `scripts/verify-database-backup.ts` (AR-0166, v1.2) : les DEUX
 * scripts ont besoin d'une base jetable, créée puis supprimée par le
 * script lui-même, jamais la base applicative réelle.
 *
 * Séparé des garde-fous purs (`temp-db-guardrails.ts`, sans effet de bord,
 * testable sans base réelle) : ce module-ci EST le point qui exécute
 * `CREATE DATABASE`/`DROP DATABASE` — chaque appelant DOIT appeler
 * `assertSafeTempDbName` juste avant, dans les deux cas (création ET
 * suppression), voir la documentation de `test-migrations-fresh-db.ts`.
 */
export async function createTempDatabase(adminUrl: string, tempDbName: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // Identifiant validé par assertSafeTempDbName (regex stricte) avant appel :
    // interpolation sûre, `CREATE DATABASE` ne supporte pas les paramètres liés.
    await client.query(`CREATE DATABASE "${tempDbName}"`);
  } finally {
    await client.end();
  }
}

export async function dropTempDatabase(adminUrl: string, tempDbName: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [tempDbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  } finally {
    await client.end();
  }
}
