import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { LockManager } from "../types";

/**
 * Fournisseur par défaut : une ligne avec contrainte unique (`lockKey`) +
 * expiration, jamais un verrou consultatif Postgres (`pg_advisory_lock`) —
 * voir ADR 0032 pour la justification (affinité de connexion incompatible
 * avec le pool de Prisma). Acquisition atomique via le motif standard
 * "upsert conditionnel" (`INSERT ... ON CONFLICT DO UPDATE ... WHERE`) :
 * un seul aller-retour, correct sous concurrence réelle sans verrou SQL
 * explicite supplémentaire.
 */
export class PostgresLockManager implements LockManager {
  readonly key = "postgres";

  async tryAcquire(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean> {
    const id = crypto.randomUUID();
    const rows = await prisma.$queryRaw<{ holderId: string }[]>(Prisma.sql`
      INSERT INTO "AutomationLock" (id, "lockKey", "holderId", "acquiredAt", "expiresAt")
      VALUES (${id}, ${params.lockKey}, ${params.holderId}, now(), now() + (${params.leaseMs}::text || ' milliseconds')::interval)
      ON CONFLICT ("lockKey") DO UPDATE
      SET "holderId" = EXCLUDED."holderId", "acquiredAt" = now(), "expiresAt" = EXCLUDED."expiresAt"
      WHERE "AutomationLock"."expiresAt" < now() OR "AutomationLock"."holderId" = ${params.holderId}
      RETURNING "holderId"
    `);
    return rows.length > 0 && rows[0].holderId === params.holderId;
  }

  async renew(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean> {
    const result = await prisma.$executeRaw(Prisma.sql`
      UPDATE "AutomationLock"
      SET "expiresAt" = now() + (${params.leaseMs}::text || ' milliseconds')::interval
      WHERE "lockKey" = ${params.lockKey} AND "holderId" = ${params.holderId}
    `);
    return result > 0;
  }

  async release(params: { lockKey: string; holderId: string }): Promise<void> {
    await prisma.automationLock.deleteMany({ where: { lockKey: params.lockKey, holderId: params.holderId } });
  }
}
