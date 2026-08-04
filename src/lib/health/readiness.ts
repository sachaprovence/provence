import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { loadEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isShuttingDown } from "@/lib/health/shutdown-state";

/**
 * Contrôle de disponibilité ("readiness", v1.2, AR-0167) — distinct de la
 * simple vivacité du processus ("liveness", voir `src/app/api/health/
 * live/route.ts`) : readiness vérifie que les composants VRAIMENT
 * indispensables au fonctionnement (base de données joignable, migrations
 * appliquées, configuration minimale valide) sont réellement utilisables,
 * pas seulement que le serveur HTTP répond.
 *
 * Une intégration OPTIONNELLE non configurée (IA, email, SMS, facturation,
 * stockage — toutes ont un repli "demo" qui ne bloque jamais le démarrage,
 * voir `src/instrumentation.ts`) ne fait JAMAIS échouer ce contrôle :
 * seuls les composants dont l'absence rendrait l'application réellement
 * inutilisable (pas de connexion base de données possible, schéma non
 * migré) sont vérifiés ici.
 *
 * Ne renvoie JAMAIS de détail exploitable (nom de table, message
 * d'erreur brut, pile d'appel) — seulement un état par vérification,
 * jamais le pourquoi précis d'un échec (journalisé côté serveur
 * uniquement, voir `logger.error` ci-dessous).
 */
export interface ReadinessCheckResult {
  ready: boolean;
  checks: {
    database: "ok" | "error";
    migrations: "ok" | "error";
    configuration: "ok" | "error";
    shutdown: "ok" | "error";
  };
}

function countMigrationFolders(): number {
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) return 0;
  return fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, "Readiness : base de données injoignable.");
    return false;
  }
}

async function checkMigrations(): Promise<boolean> {
  try {
    const expected = countMigrationFolders();
    if (expected === 0) return true; // Rien à vérifier (dépôt sans dossier de migrations — cas de test uniquement).
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    const applied = Number(result[0]?.count ?? 0);
    if (applied < expected) {
      logger.error({ applied, expected }, "Readiness : migrations attendues non toutes appliquées.");
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "Readiness : impossible de vérifier les migrations appliquées.");
    return false;
  }
}

function checkConfiguration(): boolean {
  try {
    loadEnv();
    return true;
  } catch (error) {
    logger.error({ err: error }, "Readiness : configuration d'environnement invalide.");
    return false;
  }
}

export async function evaluateReadiness(): Promise<ReadinessCheckResult> {
  // Vérifié EN PREMIER et sans attendre : dès qu'un arrêt est en cours
  // (v1.3, AR-0173), inutile d'interroger la base — l'instance doit être
  // retirée de la rotation immédiatement, quel que soit l'état des autres
  // vérifications.
  const shutdownOk = !isShuttingDown();

  const [databaseOk, migrationsOk] = await Promise.all([checkDatabase(), checkMigrations()]);
  const configurationOk = checkConfiguration();

  return {
    ready: shutdownOk && databaseOk && migrationsOk && configurationOk,
    checks: {
      database: databaseOk ? "ok" : "error",
      migrations: migrationsOk ? "ok" : "error",
      configuration: configurationOk ? "ok" : "error",
      shutdown: shutdownOk ? "ok" : "error",
    },
  };
}
