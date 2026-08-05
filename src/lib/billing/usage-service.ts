import "server-only";
import { prisma } from "@/lib/prisma";
import { countOrganizationMembers } from "./plan-service";

/**
 * Consommation courante d'une organisation vis-à-vis des limites de son
 * plan (v1.4, AR-0183) — calculée à la demande à partir des tables déjà
 * existantes (jamais un compteur dupliqué à tenir à jour) :
 * - `AutomationRun` (v0.8) pour les exécutions d'automatisation, sur une
 *   fenêtre glissante de 30 jours (pas "ce mois calendaire", qui créerait un
 *   effet de bord au changement de mois — un abonnement mensuel réel
 *   s'aligne rarement sur le mois calendaire).
 * - `Attachment.sizeBytes` (v1.1, AR-0162) pour le stockage.
 * - `Integration` (kind != DEMO) pour les connecteurs.
 * - `Membership` (déjà utilisé par `plan-service.ts#countOrganizationMembers`).
 */
export type QuotaDimensionStatus = "ok" | "warning" | "blocked";

export type QuotaDimension = {
  used: number;
  limit: number | null;
  status: QuotaDimensionStatus;
};

export type OrganizationUsage = {
  members: QuotaDimension;
  automationRuns: QuotaDimension;
  storageMb: QuotaDimension;
  connectors: QuotaDimension;
};

const WARNING_RATIO = 0.8;

function dimension(used: number, limit: number | null): QuotaDimension {
  if (limit === null) return { used, limit: null, status: "ok" };
  const status: QuotaDimensionStatus = used >= limit ? "blocked" : used >= limit * WARNING_RATIO ? "warning" : "ok";
  return { used, limit, status };
}

export async function computeOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [members, automationRuns, storageAgg, connectorKinds] = await Promise.all([
    countOrganizationMembers(organizationId),
    prisma.automationRun.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.attachment.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
    prisma.integration.findMany({ where: { organizationId, status: { not: "DEMO" } }, distinct: ["kind"], select: { kind: true } }),
  ]);

  const storageMb = Math.ceil((storageAgg._sum.sizeBytes ?? 0) / (1024 * 1024));

  return {
    members: dimension(members, organization.plan?.maxUsers ?? null),
    automationRuns: dimension(automationRuns, organization.plan?.maxAutomationRuns ?? null),
    storageMb: dimension(storageMb, organization.plan?.maxStorageMb ?? null),
    connectors: dimension(connectorKinds.length, organization.plan?.maxConnectors ?? null),
  };
}
