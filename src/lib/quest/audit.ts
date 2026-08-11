import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Audit log dédié à Personal Quest AI (§52 du brief) — scopé `userId`, pas
 * `organizationId` (voir ADR 0049) : distinct de `writeAuditLog` (CRM,
 * `src/lib/audit.ts`), qui exige une organisation.
 */
export async function writeQuestAuditLog(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.questAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata as never,
    },
  });
}
