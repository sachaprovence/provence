import { prisma } from "@/lib/prisma";

export async function writeAuditLog(params: {
  organizationId: string;
  userId?: string | null;
  leadId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId ?? undefined,
      leadId: params.leadId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      metadata: params.metadata as never,
    },
  });
}
