import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { CommercialActionStatus, CommercialActionType, CommercialStage } from "@/generated/prisma/enums";
import type { AgentInstallation } from "@/generated/prisma/client";
import type { WorkspaceActor } from "@/lib/workspace-context";
import { COMMERCIAL_AGENT_RUNTIME_KEY } from "./constants";

/**
 * Service de l'Agent Commercial (v0.5) : `CommercialProspect`/
 * `CommercialAction` scopés à une installation, jamais une table globale
 * non rattachée au Framework (voir ADR 0014). Les fonctions ici sont
 * appelées soit par les outils déclaratifs (`tools/commercial-tools.ts`,
 * contexte agent — `InstallationRef`), soit par les routes API humaines
 * (approbation/envoi — contexte `WorkspaceActor`), même principe dual que
 * `installation-service.ts` (v0.3).
 */
type InstallationRef = Pick<AgentInstallation, "id" | "organizationId" | "workspaceId" | "config">;

export async function resolveCommercialInstallation(workspaceId: string) {
  return prisma.agentInstallation.findFirst({
    where: { workspaceId, definition: { runtimeKey: COMMERCIAL_AGENT_RUNTIME_KEY } },
    include: { definition: true },
  });
}

async function resolveOwnedProspect(installation: InstallationRef, prospectId: string) {
  const prospect = await prisma.commercialProspect.findFirst({
    where: { id: prospectId, installationId: installation.id },
  });
  if (!prospect) throw new NotFoundError("Prospect introuvable.");
  return prospect;
}

/** Filtre STRICTEMENT par organisation ET workspace de l'acteur courant — même principe que `resolveInstallationOrThrow` (v0.2/v0.3). */
export async function resolveProspectForActor(
  actor: Pick<WorkspaceActor, "organization" | "workspace">,
  prospectId: string
) {
  const prospect = await prisma.commercialProspect.findFirst({
    where: { id: prospectId, organizationId: actor.organization.id, workspaceId: actor.workspace.id },
  });
  if (!prospect) throw new NotFoundError("Prospect introuvable.");
  return prospect;
}

export async function resolveActionForActor(
  actor: Pick<WorkspaceActor, "organization" | "workspace">,
  actionId: string
) {
  const action = await prisma.commercialAction.findFirst({
    where: { id: actionId, organizationId: actor.organization.id, workspaceId: actor.workspace.id },
  });
  if (!action) throw new NotFoundError("Action introuvable.");
  return action;
}

export type CreateProspectInput = {
  companyName: string;
  sector?: string;
  companySize?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  source?: string;
};

export async function createProspect(installation: InstallationRef, data: CreateProspectInput) {
  if (!data.companyName.trim()) throw new ValidationError("Le nom de l'entreprise est requis.");

  return prisma.commercialProspect.create({
    data: {
      organizationId: installation.organizationId,
      workspaceId: installation.workspaceId,
      installationId: installation.id,
      companyName: data.companyName,
      sector: data.sector,
      companySize: data.companySize,
      website: data.website,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      source: data.source,
    },
  });
}

export async function searchProspects(
  installation: InstallationRef,
  filters: { stage?: CommercialStage; query?: string } = {}
) {
  return prisma.commercialProspect.findMany({
    where: {
      installationId: installation.id,
      stage: filters.stage,
      companyName: filters.query ? { contains: filters.query, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProspectsForWorkspace(workspaceId: string, stage?: CommercialStage) {
  return prisma.commercialProspect.findMany({ where: { workspaceId, stage }, orderBy: { createdAt: "desc" } });
}

export type EnrichProspectInput = Partial<{
  sector: string;
  companySize: string;
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}>;

export async function enrichProspect(installation: InstallationRef, prospectId: string, patch: EnrichProspectInput) {
  const prospect = await resolveOwnedProspect(installation, prospectId);
  return prisma.commercialProspect.update({
    where: { id: prospect.id },
    data: {
      sector: patch.sector ?? undefined,
      companySize: patch.companySize ?? undefined,
      website: patch.website ?? undefined,
      contactName: patch.contactName ?? undefined,
      contactEmail: patch.contactEmail ?? undefined,
      contactPhone: patch.contactPhone ?? undefined,
    },
  });
}

export async function qualifyProspect(
  installation: InstallationRef,
  prospectId: string,
  params: { stage: CommercialStage; notes?: string }
) {
  const prospect = await resolveOwnedProspect(installation, prospectId);
  return prisma.commercialProspect.update({
    where: { id: prospect.id },
    data: { stage: params.stage, qualificationNotes: params.notes ?? prospect.qualificationNotes },
  });
}

export async function recordScore(installation: InstallationRef, prospectId: string, score: number, breakdown: unknown) {
  const prospect = await resolveOwnedProspect(installation, prospectId);
  return prisma.commercialProspect.update({
    where: { id: prospect.id },
    data: { score, scoreBreakdown: breakdown as never },
  });
}

export async function recordPotentialEstimate(installation: InstallationRef, prospectId: string, estimate: unknown) {
  const prospect = await resolveOwnedProspect(installation, prospectId);
  return prisma.commercialProspect.update({
    where: { id: prospect.id },
    data: { potentialEstimate: estimate as never },
  });
}

/**
 * Crée une action proposée sur un prospect. Toujours `PENDING_APPROVAL`
 * par défaut — sauf si `AgentInstallation.config.autonomousMode` est
 * explicitement `true` (architecture du mode autonome, voir ADR 0017) :
 * dans ce cas seulement, l'action est créée déjà `APPROVED` et marquée
 * `autoApproved`, mais **jamais `SENT` automatiquement** — l'envoi reste
 * toujours une étape explicite (`sendAction`).
 */
export async function createAction(
  installation: InstallationRef,
  params: { prospectId: string; type: CommercialActionType; title: string; payload: unknown; reasoning?: string }
) {
  const prospect = await resolveOwnedProspect(installation, params.prospectId);
  const config = (installation.config as { autonomousMode?: boolean } | null) ?? {};
  const autonomous = config.autonomousMode === true;

  return prisma.commercialAction.create({
    data: {
      organizationId: installation.organizationId,
      workspaceId: installation.workspaceId,
      installationId: installation.id,
      prospectId: prospect.id,
      type: params.type,
      title: params.title,
      payload: params.payload as never,
      reasoning: params.reasoning,
      status: autonomous ? CommercialActionStatus.APPROVED : CommercialActionStatus.PENDING_APPROVAL,
      autoApproved: autonomous,
    },
  });
}

export async function listActionsForWorkspace(workspaceId: string, status?: CommercialActionStatus) {
  return prisma.commercialAction.findMany({ where: { workspaceId, status }, orderBy: { createdAt: "desc" } });
}

/** Décision humaine (approuver/refuser) — jamais prise par l'agent lui-même. */
export async function decideAction(
  actor: Pick<WorkspaceActor, "organization" | "workspace" | "user">,
  actionId: string,
  decision: "APPROVED" | "REJECTED"
) {
  const action = await resolveActionForActor(actor, actionId);
  if (action.status !== CommercialActionStatus.PENDING_APPROVAL) {
    throw new ValidationError(`Impossible de statuer sur une action au statut "${action.status}".`);
  }

  const updated = await prisma.commercialAction.update({
    where: { id: action.id },
    data: { status: decision, decidedById: actor.user.id, decidedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: decision === "APPROVED" ? "commercial.action_approved" : "commercial.action_rejected",
    entityType: "CommercialAction",
    entityId: action.id,
  });

  return updated;
}

const STAGE_ON_SEND: Partial<Record<CommercialActionType, CommercialStage>> = {
  EMAIL_DRAFT: CommercialStage.FIRST_CONTACT,
  FOLLOW_UP: CommercialStage.FOLLOW_UP,
  QUOTE_DRAFT: CommercialStage.QUOTE_SENT,
  PROPOSAL: CommercialStage.NEGOTIATION,
};

/**
 * Marque une action `APPROVED` comme réellement envoyée — la seule étape
 * qui fait progresser le pipeline (`CommercialProspect.stage`), pour que le
 * statut du prospect reflète toujours la réalité de ce qui a été envoyé,
 * jamais ce qui a simplement été rédigé. Aucun fournisseur d'envoi réel
 * (email) n'est câblé ici — voir ADR 0017 : ce champ documente
 * l'intention, l'intégration réelle est hors périmètre de cette phase.
 */
export async function sendAction(actor: Pick<WorkspaceActor, "organization" | "workspace" | "user">, actionId: string) {
  const action = await resolveActionForActor(actor, actionId);
  if (action.status !== CommercialActionStatus.APPROVED) {
    throw new ValidationError("Seule une action approuvée peut être envoyée.");
  }

  const updated = await prisma.commercialAction.update({
    where: { id: action.id },
    data: { status: CommercialActionStatus.SENT, sentAt: new Date() },
  });

  const nextStage = STAGE_ON_SEND[action.type];
  if (nextStage) {
    await prisma.commercialProspect.update({ where: { id: action.prospectId }, data: { stage: nextStage } });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "commercial.action_sent",
    entityType: "CommercialAction",
    entityId: action.id,
  });

  return updated;
}
