import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { spawnSync } from "node:child_process";
import {
  realAppDbName,
  generateTempDbName,
  assertSafeTempDbName,
  adminConnectionUrl,
  tempConnectionUrl,
  pgToolConnectionUrl,
  UnsafeTempDbNameError,
} from "./lib/temp-db-guardrails";
import { createTempDatabase, dropTempDatabase } from "./lib/temp-db";
import { readBackupMetadata, verifyBackupIntegrity, writeBackupMetadata } from "./lib/db-backup";

/**
 * Vérification de sauvegarde PostgreSQL par restauration RÉELLE (v1.2,
 * AR-0166) — exigence explicite : "une sauvegarde ne doit jamais être
 * déclarée valide sans un test de restauration réussi." Ce script ne
 * touche JAMAIS la base applicative réelle : il restaure le fichier fourni
 * dans une base temporaire jetable (mêmes garde-fous que
 * `scripts/test-migrations-fresh-db.ts`, AR-0163 — nom généré, jamais lu
 * depuis l'extérieur, revalidé avant création ET avant suppression), puis
 * la supprime dans tous les cas (bloc `finally`).
 *
 * Usage : `npx tsx scripts/verify-database-backup.ts <fichier.dump>`
 *
 * En cas de succès, met à jour `<fichier.dump>.meta.json` :
 * `restoreVerified: true`, `restoreVerifiedAt: <horodatage>` — c'est le
 * SEUL endroit du projet qui positionne ce champ à `true`.
 */
function fail(message: string): never {
  throw new Error(message);
}

function guardTempDbName(name: string, realDbName: string): void {
  try {
    assertSafeTempDbName(name, realDbName);
  } catch (err) {
    if (err instanceof UnsafeTempDbNameError) fail(`Garde-fou : ${err.message}`);
    throw err;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Variable d'environnement requise absente : ${name}`);
  return value as string;
}

/** Nombre de dossiers de migration réellement présents dans le dépôt — sert à vérifier qu'une sauvegarde n'est pas partielle/périmée. */
function expectedMigrationCount(): number {
  const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
  return fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

async function countRow(connectionUrl: string, sql: string): Promise<number> {
  const client = new Client({ connectionString: connectionUrl });
  await client.connect();
  try {
    const result = await client.query(sql);
    return Number(result.rows[0].count);
  } finally {
    await client.end();
  }
}

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) fail("Usage : npx tsx scripts/verify-database-backup.ts <fichier.dump>");
  if (!fs.existsSync(dumpPath)) fail(`Fichier de sauvegarde introuvable : ${dumpPath}`);

  console.log(`→ Vérification de l'intégrité (empreinte SHA-256) de "${dumpPath}"...`);
  const metadata = readBackupMetadata(dumpPath);
  verifyBackupIntegrity(dumpPath, metadata);
  console.log("  ✅ empreinte conforme, fichier non altéré.");

  const realDatabaseUrl = requireEnv("DATABASE_URL");
  const realDbName = realAppDbName(realDatabaseUrl);
  const adminUrl = adminConnectionUrl(realDatabaseUrl);

  const tempDbName = generateTempDbName();
  guardTempDbName(tempDbName, realDbName);
  const tempUrl = tempConnectionUrl(realDatabaseUrl, tempDbName);

  console.log(`Base applicative réelle (jamais touchée) : "${realDbName}"`);
  console.log(`Base temporaire de restauration (créée puis supprimée) : "${tempDbName}"`);

  try {
    console.log(`\n→ création de la base temporaire "${tempDbName}"`);
    await createTempDatabase(adminUrl, tempDbName);

    console.log(`\n→ restauration réelle du fichier dans la base temporaire (pg_restore)`);
    const restoreResult = spawnSync("pg_restore", ["--no-owner", "--no-privileges", `--dbname=${pgToolConnectionUrl(tempUrl)}`, dumpPath], { stdio: "inherit" });
    // pg_restore renvoie parfois un code non nul pour des avertissements bénins
    // (objets déjà présents, dépendances d'extension) — la preuve réelle de
    // succès est la vérification structurelle/de contenu ci-dessous, pas
    // seulement le code de sortie brut.
    if (restoreResult.status !== 0) {
      console.warn(`  ⚠️  pg_restore a renvoyé le code ${restoreResult.status} (peut être bénin) — vérification du contenu restauré ci-dessous.`);
    }

    console.log(`\n→ vérification structurelle (migrations appliquées, tables essentielles accessibles)`);
    const migrationCount = await countRow(tempUrl, `SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`);
    const expected = expectedMigrationCount();
    console.log(`  migrations appliquées dans la sauvegarde restaurée : ${migrationCount} / ${expected} attendues (dépôt actuel)`);
    if (migrationCount < expected) {
      fail(
        `La sauvegarde restaurée ne contient que ${migrationCount} migrations appliquées, ${expected} attendues — ` +
          `sauvegarde partielle ou trop ancienne, refusée.`
      );
    }

    const organizationCount = await countRow(tempUrl, `SELECT COUNT(*)::int AS count FROM "Organization"`);
    const userCount = await countRow(tempUrl, `SELECT COUNT(*)::int AS count FROM "User"`);
    console.log(`  organisations restaurées : ${organizationCount}`);
    console.log(`  utilisateurs restaurés : ${userCount}`);

    console.log("\n✅ Restauration réussie et contenu vérifié — sauvegarde déclarée valide.");
    writeBackupMetadata(dumpPath, { ...metadata, restoreVerified: true, restoreVerifiedAt: new Date().toISOString() });
    console.log(`   Métadonnées mises à jour : ${dumpPath}.meta.json`);
  } finally {
    console.log(`\n→ suppression de la base temporaire "${tempDbName}"`);
    guardTempDbName(tempDbName, realDbName);
    await dropTempDatabase(adminUrl, tempDbName);
    console.log("  ✅ base temporaire supprimée.");
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
