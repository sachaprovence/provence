import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { AutomationDefinitionStatus } from "@/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-context";
import { validateAutomationGraph } from "../graph-validation";
import type { AutomationGraph } from "../graph-types";

/**
 * Automation Registry (v0.8) : cycle de vie d'un `Automation` — créé,
 * modifié, versionné, activé, désactivé, cloné, exporté, importé,
 * archivé. Même structure que `workflows/workflow-service.ts` (v0.6),
 * délibérément — voir ADR 0031 : c'est la couche "identité + registre",
 * jamais l'exécution elle-même (voir Job Executor, `job-executor.ts`).
 */
type ActorRef = Pick<WorkspaceActor, "organization" | "workspace" | "user">;

function assertValidGraph(graph: AutomationGraph) {
  const issues = validateAutomationGraph(graph);
  if (issues.length > 0) {
    throw new ValidationError("Le graphe de l'automatisation est invalide.", { issues });
  }
}

/**
 * Crée une `AutomationRun` (statut `QUEUED`) — la seule chose que fait
 * cette fonction est d'ouvrir le run : l'ensemencement des premiers jobs
 * et toute la progression du graphe sont la responsabilité du Job
 * Executor (`advanceAutomationRun`, voir `job-executor.ts`), pas de la
 * couche registre. Ne pilote jamais le run jusqu'au bout elle-même —
 * contrairement à `workflows/execution-engine.ts#createWorkflowRun` suivi
 * d'un appel synchrone, l'exécution de l'Automation Engine est
 * intrinsèquement asynchrone (voir ADR 0031) : un appelant qui a besoin
 * du résultat doit interroger le run ou s'appuyer sur un mécanisme de
 * rappel, jamais attendre en bloquant ce point d'entrée.
 */
export async function createAutomationRun(params: {
  organizationId: string;
  workspaceId: string;
  automationId: string;
  automationVersionId: string;
  input?: unknown;
  trigger?: "MANUAL" | "SCHEDULED" | "EVENT" | "WEBHOOK" | "API" | "AUTOMATION";
  triggerKey?: string;
  priority?: number;
  maxAttempts?: number;
  parentRunId?: string;
  createdById?: string;
}) {
  return prisma.automationRun.create({
    data: {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      automationId: params.automationId,
      automationVersionId: params.automationVersionId,
      input: (params.input ?? null) as never,
      trigger: params.trigger ?? "MANUAL",
      triggerKey: params.triggerKey,
      priority: params.priority ?? 0,
      maxAttempts: params.maxAttempts ?? 1,
      parentRunId: params.parentRunId,
      createdById: params.createdById,
    },
  });
}

/** Filtre STRICTEMENT par organisation ET workspace de l'acteur courant, ou un template global (workspaceId nul). */
export async function resolveAutomationForActor(actor: ActorRef, automationId: string) {
  const automation = await prisma.automation.findFirst({
    where: {
      id: automationId,
      OR: [
        { organizationId: actor.organization.id, workspaceId: actor.workspace.id },
        { organizationId: null, workspaceId: null, isTemplate: true },
      ],
    },
    include: { activeVersion: true },
  });
  if (!automation) throw new NotFoundError("Automatisation introuvable.");
  return automation;
}

/** Même principe — STRICTEMENT scopé organisation/workspace, jamais par id seul. */
export async function resolveAutomationRunForActor(actor: ActorRef, runId: string) {
  const run = await prisma.automationRun.findFirst({
    where: { id: runId, organizationId: actor.organization.id, workspaceId: actor.workspace.id },
    include: { automation: { select: { name: true, key: true } } },
  });
  if (!run) throw new NotFoundError("Exécution d'automatisation introuvable.");
  return run;
}

export async function getAutomationRunDetail(actor: ActorRef, runId: string) {
  const run = await resolveAutomationRunForActor(actor, runId);
  const [jobs, logs] = await Promise.all([
    prisma.automationJob.findMany({ where: { automationRunId: run.id }, orderBy: { createdAt: "asc" } }),
    prisma.automationRunLog.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return { run, jobs, logs };
}

export async function listAutomationRunsForWorkspace(workspaceId: string, limit = 50) {
  return prisma.automationRun.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { automation: { select: { name: true, key: true } } },
  });
}

export async function listAutomationJobsForWorkspace(workspaceId: string, opts: { status?: string; limit?: number } = {}) {
  return prisma.automationJob.findMany({
    where: { workspaceId, ...(opts.status ? { status: opts.status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });
}

/** Même principe — STRICTEMENT scopé organisation/workspace, jamais par id seul. */
export async function resolveAutomationJobForActor(actor: ActorRef, jobId: string) {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, organizationId: actor.organization.id, workspaceId: actor.workspace.id },
  });
  if (!job) throw new NotFoundError("Job d'automatisation introuvable.");
  return job;
}

export async function getAutomationJobDetail(actor: ActorRef, jobId: string) {
  const job = await resolveAutomationJobForActor(actor, jobId);
  const logs = await prisma.automationJobLog.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } });
  return { job, logs };
}

export async function listAutomationsForWorkspace(workspaceId: string, opts: { includeTemplates?: boolean } = {}) {
  return prisma.automation.findMany({
    where: opts.includeTemplates ? { OR: [{ workspaceId }, { isTemplate: true, workspaceId: null }] } : { workspaceId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getAutomationDetail(actor: ActorRef, automationId: string) {
  const automation = await resolveAutomationForActor(actor, automationId);
  const [versions, recentRuns] = await Promise.all([
    prisma.automationVersion.findMany({ where: { automationId: automation.id }, orderBy: { version: "desc" } }),
    prisma.automationRun.findMany({ where: { automationId: automation.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { automation, versions, recentRuns };
}

export async function createAutomationDefinition(
  actor: ActorRef,
  params: { key: string; name: string; description?: string; category: string; graph: AutomationGraph }
) {
  if (!params.key.trim() || !params.name.trim()) {
    throw new ValidationError('Une clé ("key") et un nom sont requis.');
  }
  assertValidGraph(params.graph);

  const existing = await prisma.automation.findFirst({ where: { workspaceId: actor.workspace.id, key: params.key } });
  if (existing) throw new ValidationError(`Une automatisation avec la clé "${params.key}" existe déjà dans ce workspace.`);

  const automation = await prisma.automation.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key: params.key,
      name: params.name,
      description: params.description,
      category: params.category,
      status: AutomationDefinitionStatus.DRAFT,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.automationVersion.create({
    data: { automationId: automation.id, version: 1, graph: params.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.created",
    entityType: "Automation",
    entityId: automation.id,
    metadata: { key: params.key },
  });

  return { automation, version };
}

/** Crée une nouvelle version (jamais de modification en place — même principe que `PromptTemplate`/`WorkflowVersion`). */
export async function createNewAutomationVersion(
  actor: ActorRef,
  automationId: string,
  params: { graph: AutomationGraph; changelog?: string }
) {
  const automation = await resolveAutomationForActor(actor, automationId);
  if (automation.status === AutomationDefinitionStatus.ARCHIVED) {
    throw new ValidationError("Une automatisation archivée ne peut plus recevoir de nouvelle version.");
  }
  assertValidGraph(params.graph);

  const latest = await prisma.automationVersion.findFirst({ where: { automationId: automation.id }, orderBy: { version: "desc" } });
  const version = await prisma.automationVersion.create({
    data: {
      automationId: automation.id,
      version: (latest?.version ?? 0) + 1,
      graph: params.graph as never,
      changelog: params.changelog,
      createdById: actor.user.id,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.version_created",
    entityType: "AutomationVersion",
    entityId: version.id,
    metadata: { automationId: automation.id, version: version.version },
  });

  return version;
}

/** Extrait les noeuds "trigger" du graphe activé vers `AutomationTriggerBinding` (index de résolution rapide, voir `trigger-engine.ts`). */
async function reindexAutomationTriggerBindings(automationId: string, workspaceId: string, version: { id: string; graph: AutomationGraph }) {
  await prisma.automationTriggerBinding.deleteMany({ where: { automationId } });
  const triggerNodes = version.graph.nodes.filter((n) => n.type === "trigger");
  if (triggerNodes.length === 0) return;
  await prisma.automationTriggerBinding.createMany({
    data: triggerNodes.map((node) => ({
      automationId,
      automationVersionId: version.id,
      workspaceId,
      nodeId: node.id,
      triggerKey: (node.data as { triggerKey: string }).triggerKey,
      config: ((node.data as { config?: unknown }).config ?? null) as never,
    })),
  });
}

export async function activateAutomationVersion(actor: ActorRef, automationId: string, versionId: string) {
  const automation = await resolveAutomationForActor(actor, automationId);
  if (automation.isTemplate) {
    throw new ValidationError("Un template ne peut pas être activé directement — clonez-le d'abord dans un workspace.");
  }
  const version = await prisma.automationVersion.findFirst({ where: { id: versionId, automationId: automation.id } });
  if (!version) throw new NotFoundError("Version d'automatisation introuvable.");

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: { status: AutomationDefinitionStatus.ACTIVE, activeVersionId: version.id },
  });
  await reindexAutomationTriggerBindings(automation.id, automation.workspaceId!, { id: version.id, graph: version.graph as unknown as AutomationGraph });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.activated",
    entityType: "Automation",
    entityId: automation.id,
    metadata: { version: version.version },
  });

  return updated;
}

export async function deactivateAutomation(actor: ActorRef, automationId: string) {
  const automation = await resolveAutomationForActor(actor, automationId);
  const updated = await prisma.automation.update({ where: { id: automation.id }, data: { status: AutomationDefinitionStatus.INACTIVE } });
  await prisma.automationTriggerBinding.updateMany({ where: { automationId: automation.id }, data: { isActive: false } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.deactivated",
    entityType: "Automation",
    entityId: automation.id,
  });

  return updated;
}

export async function archiveAutomation(actor: ActorRef, automationId: string) {
  const automation = await resolveAutomationForActor(actor, automationId);
  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: { status: AutomationDefinitionStatus.ARCHIVED, archivedAt: new Date() },
  });
  await prisma.automationTriggerBinding.updateMany({ where: { automationId: automation.id }, data: { isActive: false } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.archived",
    entityType: "Automation",
    entityId: automation.id,
  });

  return updated;
}

/** Clone une automatisation existante (ou un template global) dans le workspace de l'acteur — toujours en `DRAFT`. */
export async function cloneAutomationDefinition(actor: ActorRef, sourceAutomationId: string, params: { newKey: string; newName: string }) {
  const source = await resolveAutomationForActor(actor, sourceAutomationId);
  const sourceVersion = source.activeVersionId
    ? await prisma.automationVersion.findUnique({ where: { id: source.activeVersionId } })
    : await prisma.automationVersion.findFirst({ where: { automationId: source.id }, orderBy: { version: "desc" } });
  if (!sourceVersion) throw new ValidationError("L'automatisation source n'a aucune version à cloner.");

  const existing = await prisma.automation.findFirst({ where: { workspaceId: actor.workspace.id, key: params.newKey } });
  if (existing) throw new ValidationError(`Une automatisation avec la clé "${params.newKey}" existe déjà dans ce workspace.`);

  const cloned = await prisma.automation.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key: params.newKey,
      name: params.newName,
      description: source.description,
      category: source.category,
      status: AutomationDefinitionStatus.DRAFT,
      isTemplate: false,
      sourceTemplateKey: source.isTemplate ? source.key : source.sourceTemplateKey,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.automationVersion.create({
    data: { automationId: cloned.id, version: 1, graph: sourceVersion.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.cloned",
    entityType: "Automation",
    entityId: cloned.id,
    metadata: { sourceAutomationId: source.id },
  });

  return { automation: cloned, version };
}

export type AutomationExportPayload = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  graph: AutomationGraph;
};

export async function exportAutomationDefinition(actor: ActorRef, automationId: string): Promise<AutomationExportPayload> {
  const automation = await resolveAutomationForActor(actor, automationId);
  const version = automation.activeVersionId
    ? await prisma.automationVersion.findUnique({ where: { id: automation.activeVersionId } })
    : await prisma.automationVersion.findFirst({ where: { automationId: automation.id }, orderBy: { version: "desc" } });
  if (!version) throw new ValidationError("L'automatisation n'a aucune version à exporter.");

  return {
    key: automation.key,
    name: automation.name,
    description: automation.description,
    category: automation.category,
    graph: version.graph as unknown as AutomationGraph,
  };
}

export async function importAutomationDefinition(actor: ActorRef, payload: AutomationExportPayload) {
  assertValidGraph(payload.graph);

  let key = payload.key;
  let suffix = 0;
  while (await prisma.automation.findFirst({ where: { workspaceId: actor.workspace.id, key } })) {
    suffix += 1;
    key = `${payload.key}-import-${suffix}`;
  }

  const automation = await prisma.automation.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key,
      name: payload.name,
      description: payload.description ?? undefined,
      category: payload.category,
      status: AutomationDefinitionStatus.DRAFT,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.automationVersion.create({
    data: { automationId: automation.id, version: 1, graph: payload.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "automation.imported",
    entityType: "Automation",
    entityId: automation.id,
    metadata: { originalKey: payload.key, assignedKey: key },
  });

  return { automation, version };
}
