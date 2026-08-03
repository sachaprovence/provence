import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { AgentMessageType, AgentMessageStatus, AgentInterventionStatus } from "@/generated/prisma/enums";

/**
 * Communication inter-agents et agent<->humain. Toutes les communications
 * sont historisées : on ne modifie jamais le contenu d'un message après
 * création, seulement son `status` (PENDING -> DELIVERED -> READ ->
 * ACTIONED).
 */
export async function sendAgentMessage(params: {
  workspaceId: string;
  fromInstallationId?: string | null;
  toInstallationId?: string | null;
  runId?: string | null;
  type: AgentMessageType;
  payload: unknown;
}) {
  const message = await prisma.agentMessage.create({
    data: {
      workspaceId: params.workspaceId,
      fromInstallationId: params.fromInstallationId ?? null,
      toInstallationId: params.toInstallationId ?? null,
      runId: params.runId ?? null,
      type: params.type,
      payload: params.payload as never,
      status: AgentMessageStatus.PENDING,
    },
  });

  if (params.type === AgentMessageType.INTERVENTION_REQUEST) {
    const payload = params.payload as { title?: string; description?: string } | null;
    if (!params.fromInstallationId) {
      throw new ValidationError("Une demande d'intervention doit provenir d'une installation d'agent.");
    }
    await createInterventionRequest({
      workspaceId: params.workspaceId,
      installationId: params.fromInstallationId,
      runId: params.runId ?? null,
      messageId: message.id,
      title: payload?.title ?? "Intervention demandée",
      description: payload?.description,
    });
  }

  return message;
}

export async function markMessageDelivered(messageId: string) {
  return prisma.agentMessage.update({
    where: { id: messageId },
    data: { status: AgentMessageStatus.DELIVERED, deliveredAt: new Date() },
  });
}

export async function markMessageRead(messageId: string) {
  return prisma.agentMessage.update({
    where: { id: messageId },
    data: { status: AgentMessageStatus.READ, readAt: new Date() },
  });
}

export async function listMessages(params: {
  workspaceId: string;
  installationId?: string;
  runId?: string;
  limit?: number;
}) {
  return prisma.agentMessage.findMany({
    where: {
      workspaceId: params.workspaceId,
      runId: params.runId,
      ...(params.installationId
        ? { OR: [{ fromInstallationId: params.installationId }, { toInstallationId: params.installationId }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 100,
  });
}

export async function createInterventionRequest(params: {
  workspaceId: string;
  installationId: string;
  runId?: string | null;
  messageId?: string | null;
  title: string;
  description?: string;
}) {
  const intervention = await prisma.agentInterventionRequest.create({
    data: {
      workspaceId: params.workspaceId,
      installationId: params.installationId,
      runId: params.runId ?? null,
      messageId: params.messageId ?? null,
      title: params.title,
      description: params.description,
    },
  });

  await writeAuditLog({
    organizationId: (await prisma.agentInstallation.findUniqueOrThrow({ where: { id: params.installationId } }))
      .organizationId,
    action: "agent.intervention_requested",
    entityType: "AgentInterventionRequest",
    entityId: intervention.id,
    metadata: { title: params.title },
  });

  return intervention;
}

export async function listInterventionRequests(params: { workspaceId: string; status?: AgentInterventionStatus }) {
  return prisma.agentInterventionRequest.findMany({
    where: { workspaceId: params.workspaceId, status: params.status },
    orderBy: { createdAt: "desc" },
  });
}

export async function resolveInterventionRequest(params: {
  organizationId: string;
  workspaceId: string;
  interventionId: string;
  resolvedById: string;
  status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
}) {
  const intervention = await prisma.agentInterventionRequest.findFirst({
    where: { id: params.interventionId, workspaceId: params.workspaceId },
  });
  if (!intervention) throw new NotFoundError("Demande d'intervention introuvable.");

  const updated = await prisma.agentInterventionRequest.update({
    where: { id: params.interventionId },
    data: {
      status: params.status,
      resolvedById: params.status !== "ACKNOWLEDGED" ? params.resolvedById : undefined,
      resolvedAt: params.status !== "ACKNOWLEDGED" ? new Date() : undefined,
    },
  });

  await writeAuditLog({
    organizationId: params.organizationId,
    userId: params.resolvedById,
    action: "agent.intervention_resolved",
    entityType: "AgentInterventionRequest",
    entityId: params.interventionId,
    metadata: { status: params.status },
  });

  return updated;
}
