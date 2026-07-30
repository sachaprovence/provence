import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { WorkflowDefinitionStatus } from "@/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-context";
import { validateWorkflowGraph } from "./graph-validation";
import { createWorkflowRun, executeWorkflowRun } from "./execution-engine";
import type { WorkflowGraph } from "./graph-types";

/**
 * Cycle de vie d'un `WorkflowDefinition` (voir brief v0.6 : créé, modifié,
 * versionné, activé, désactivé, cloné, exporté, importé, archivé). Chaque
 * fonction ne fait que la gestion du cycle de vie — jamais l'exécution
 * elle-même (voir `execution-engine.ts`).
 */
type ActorRef = Pick<WorkspaceActor, "organization" | "workspace" | "user">;

function assertValidGraph(graph: WorkflowGraph) {
  const issues = validateWorkflowGraph(graph);
  if (issues.length > 0) {
    throw new ValidationError("Le graphe du workflow est invalide.", { issues });
  }
}

/** Filtre STRICTEMENT par organisation ET workspace de l'acteur courant, ou un template global (workspaceId nul). */
export async function resolveDefinitionForActor(actor: ActorRef, definitionId: string) {
  const definition = await prisma.workflowDefinition.findFirst({
    where: {
      id: definitionId,
      OR: [
        { organizationId: actor.organization.id, workspaceId: actor.workspace.id },
        { organizationId: null, workspaceId: null, isTemplate: true },
      ],
    },
    include: { activeVersion: true },
  });
  if (!definition) throw new NotFoundError("Workflow introuvable.");
  return definition;
}

/** Filtre STRICTEMENT par organisation ET workspace de l'acteur courant — même principe que `resolveDefinitionForActor`. */
export async function resolveRunForActor(actor: ActorRef, runId: string) {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, organizationId: actor.organization.id, workspaceId: actor.workspace.id },
    include: { workflowDefinition: { select: { name: true, key: true } } },
  });
  if (!run) throw new NotFoundError("Exécution de workflow introuvable.");
  return run;
}

export async function getRunDetail(actor: ActorRef, runId: string) {
  const run = await resolveRunForActor(actor, runId);
  const [steps, logs] = await Promise.all([
    prisma.workflowRunStep.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } }),
    prisma.workflowRunLog.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return { run, steps, logs };
}

export async function listRunsForWorkspace(workspaceId: string, limit = 50) {
  return prisma.workflowRun.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { workflowDefinition: { select: { name: true, key: true } } },
  });
}

export async function listDefinitionsForWorkspace(workspaceId: string, opts: { includeTemplates?: boolean } = {}) {
  return prisma.workflowDefinition.findMany({
    where: opts.includeTemplates
      ? { OR: [{ workspaceId }, { isTemplate: true, workspaceId: null }] }
      : { workspaceId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getDefinitionDetail(actor: ActorRef, definitionId: string) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  const [versions, recentRuns] = await Promise.all([
    prisma.workflowVersion.findMany({ where: { workflowDefinitionId: definition.id }, orderBy: { version: "desc" } }),
    prisma.workflowRun.findMany({ where: { workflowDefinitionId: definition.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { definition, versions, recentRuns };
}

export async function createWorkflowDefinition(
  actor: ActorRef,
  params: { key: string; name: string; description?: string; category: string; graph: WorkflowGraph }
) {
  if (!params.key.trim() || !params.name.trim()) {
    throw new ValidationError('Une clé ("key") et un nom sont requis.');
  }
  assertValidGraph(params.graph);

  const existing = await prisma.workflowDefinition.findFirst({ where: { workspaceId: actor.workspace.id, key: params.key } });
  if (existing) throw new ValidationError(`Un workflow avec la clé "${params.key}" existe déjà dans ce workspace.`);

  const definition = await prisma.workflowDefinition.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key: params.key,
      name: params.name,
      description: params.description,
      category: params.category,
      status: WorkflowDefinitionStatus.DRAFT,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.workflowVersion.create({
    data: { workflowDefinitionId: definition.id, version: 1, graph: params.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.created",
    entityType: "WorkflowDefinition",
    entityId: definition.id,
    metadata: { key: params.key },
  });

  return { definition, version };
}

/** Crée une nouvelle version (jamais de modification en place — même principe que `PromptTemplate`, v0.5). */
export async function createNewVersion(actor: ActorRef, definitionId: string, params: { graph: WorkflowGraph; changelog?: string }) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  if (definition.status === WorkflowDefinitionStatus.ARCHIVED) {
    throw new ValidationError("Un workflow archivé ne peut plus recevoir de nouvelle version.");
  }
  assertValidGraph(params.graph);

  const latest = await prisma.workflowVersion.findFirst({
    where: { workflowDefinitionId: definition.id },
    orderBy: { version: "desc" },
  });
  const version = await prisma.workflowVersion.create({
    data: {
      workflowDefinitionId: definition.id,
      version: (latest?.version ?? 0) + 1,
      graph: params.graph as never,
      changelog: params.changelog,
      createdById: actor.user.id,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.version_created",
    entityType: "WorkflowVersion",
    entityId: version.id,
    metadata: { workflowDefinitionId: definition.id, version: version.version },
  });

  return version;
}

/** Extrait les noeuds "trigger" du graphe activé vers `WorkflowTriggerBinding` (index de résolution rapide, voir `trigger-engine.ts`). */
async function reindexTriggerBindings(definitionId: string, workspaceId: string, version: { id: string; graph: WorkflowGraph }) {
  await prisma.workflowTriggerBinding.deleteMany({ where: { workflowDefinitionId: definitionId } });
  const triggerNodes = version.graph.nodes.filter((n) => n.type === "trigger");
  if (triggerNodes.length === 0) return;
  await prisma.workflowTriggerBinding.createMany({
    data: triggerNodes.map((node) => ({
      workflowDefinitionId: definitionId,
      workflowVersionId: version.id,
      workspaceId,
      nodeId: node.id,
      triggerKey: (node.data as { triggerKey: string }).triggerKey,
      config: ((node.data as { config?: unknown }).config ?? null) as never,
    })),
  });
}

export async function activateVersion(actor: ActorRef, definitionId: string, versionId: string) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  if (definition.isTemplate) throw new ValidationError("Un template ne peut pas être activé directement — clonez-le d'abord dans un workspace.");
  const version = await prisma.workflowVersion.findFirst({ where: { id: versionId, workflowDefinitionId: definition.id } });
  if (!version) throw new NotFoundError("Version de workflow introuvable.");

  const updated = await prisma.workflowDefinition.update({
    where: { id: definition.id },
    data: { status: WorkflowDefinitionStatus.ACTIVE, activeVersionId: version.id },
  });
  await reindexTriggerBindings(definition.id, definition.workspaceId!, { id: version.id, graph: version.graph as unknown as WorkflowGraph });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.activated",
    entityType: "WorkflowDefinition",
    entityId: definition.id,
    metadata: { version: version.version },
  });

  return updated;
}

export async function deactivateDefinition(actor: ActorRef, definitionId: string) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  const updated = await prisma.workflowDefinition.update({
    where: { id: definition.id },
    data: { status: WorkflowDefinitionStatus.INACTIVE },
  });
  await prisma.workflowTriggerBinding.updateMany({ where: { workflowDefinitionId: definition.id }, data: { isActive: false } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.deactivated",
    entityType: "WorkflowDefinition",
    entityId: definition.id,
  });

  return updated;
}

export async function archiveDefinition(actor: ActorRef, definitionId: string) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  const updated = await prisma.workflowDefinition.update({
    where: { id: definition.id },
    data: { status: WorkflowDefinitionStatus.ARCHIVED, archivedAt: new Date() },
  });
  await prisma.workflowTriggerBinding.updateMany({ where: { workflowDefinitionId: definition.id }, data: { isActive: false } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.archived",
    entityType: "WorkflowDefinition",
    entityId: definition.id,
  });

  return updated;
}

/** Clone un workflow existant (ou un template global) dans le workspace de l'acteur — toujours en `DRAFT`, jamais activé automatiquement. */
export async function cloneWorkflowDefinition(actor: ActorRef, sourceDefinitionId: string, params: { newKey: string; newName: string }) {
  const source = await resolveDefinitionForActor(actor, sourceDefinitionId);
  const sourceVersion = source.activeVersionId
    ? await prisma.workflowVersion.findUnique({ where: { id: source.activeVersionId } })
    : await prisma.workflowVersion.findFirst({ where: { workflowDefinitionId: source.id }, orderBy: { version: "desc" } });
  if (!sourceVersion) throw new ValidationError("Le workflow source n'a aucune version à cloner.");

  const existing = await prisma.workflowDefinition.findFirst({ where: { workspaceId: actor.workspace.id, key: params.newKey } });
  if (existing) throw new ValidationError(`Un workflow avec la clé "${params.newKey}" existe déjà dans ce workspace.`);

  const cloned = await prisma.workflowDefinition.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key: params.newKey,
      name: params.newName,
      description: source.description,
      category: source.category,
      status: WorkflowDefinitionStatus.DRAFT,
      isTemplate: false,
      sourceTemplateKey: source.isTemplate ? source.key : source.sourceTemplateKey,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.workflowVersion.create({
    data: { workflowDefinitionId: cloned.id, version: 1, graph: sourceVersion.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.cloned",
    entityType: "WorkflowDefinition",
    entityId: cloned.id,
    metadata: { sourceDefinitionId: source.id },
  });

  return { definition: cloned, version };
}

export type WorkflowExportPayload = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  graph: WorkflowGraph;
};

/** Export d'un instantané (métadonnées + version active/dernière) — pas l'historique complet des versions, voir ADR 0019. */
export async function exportWorkflowDefinition(actor: ActorRef, definitionId: string): Promise<WorkflowExportPayload> {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  const version = definition.activeVersionId
    ? await prisma.workflowVersion.findUnique({ where: { id: definition.activeVersionId } })
    : await prisma.workflowVersion.findFirst({ where: { workflowDefinitionId: definition.id }, orderBy: { version: "desc" } });
  if (!version) throw new ValidationError("Le workflow n'a aucune version à exporter.");

  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    graph: version.graph as unknown as WorkflowGraph,
  };
}

export async function importWorkflowDefinition(actor: ActorRef, payload: WorkflowExportPayload) {
  assertValidGraph(payload.graph);

  let key = payload.key;
  let suffix = 0;
  while (await prisma.workflowDefinition.findFirst({ where: { workspaceId: actor.workspace.id, key } })) {
    suffix += 1;
    key = `${payload.key}-import-${suffix}`;
  }

  const definition = await prisma.workflowDefinition.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      key,
      name: payload.name,
      description: payload.description ?? undefined,
      category: payload.category,
      status: WorkflowDefinitionStatus.DRAFT,
      createdById: actor.user.id,
    },
  });
  const version = await prisma.workflowVersion.create({
    data: { workflowDefinitionId: definition.id, version: 1, graph: payload.graph as never, createdById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.imported",
    entityType: "WorkflowDefinition",
    entityId: definition.id,
    metadata: { originalKey: payload.key, assignedKey: key },
  });

  return { definition, version };
}

/**
 * Relance un run terminé en échec/annulé : crée un NOUVEAU `WorkflowRun`
 * (même workflow/version/input), relié au précédent via `parentRunId` —
 * jamais un rejeu en place — même principe que
 * `director/delegation-engine.ts#retryStepDelegation` (v0.4), pour garder
 * une lignée de reprise visible dans l'historique.
 */
export async function retryWorkflowRun(actor: ActorRef, runId: string) {
  const previous = await resolveRunForActor(actor, runId);
  if (!["FAILED", "TIMED_OUT", "CANCELLED"].includes(previous.status)) {
    throw new ValidationError(`Seul un run terminé en échec/annulé peut être relancé (statut actuel : "${previous.status}").`);
  }

  const run = await createWorkflowRun({
    organizationId: previous.organizationId,
    workspaceId: previous.workspaceId,
    workflowDefinitionId: previous.workflowDefinitionId,
    workflowVersionId: previous.workflowVersionId,
    input: previous.input,
    trigger: previous.trigger,
    triggerKey: previous.triggerKey ?? undefined,
    parentRunId: previous.id,
    createdById: actor.user.id,
  });
  await executeWorkflowRun(run.id);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.run_retried",
    entityType: "WorkflowRun",
    entityId: run.id,
    metadata: { previousRunId: previous.id },
  });

  return prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
}

/** Déclenchement manuel ("Action utilisateur") — un seul appel à `executeWorkflowRun`, jamais un pilotage jusqu'au bout : un workflow peut légitimement rester `WAITING`/`QUEUED`, la reprise est assurée par les tâches planifiées (voir `execution-engine.ts`). */
export async function triggerManualRun(actor: ActorRef, definitionId: string, input?: unknown) {
  const definition = await resolveDefinitionForActor(actor, definitionId);
  if (!definition.activeVersionId) {
    throw new ValidationError("Le workflow doit avoir une version active pour être déclenché.");
  }

  const run = await createWorkflowRun({
    organizationId: actor.organization.id,
    workspaceId: actor.workspace.id,
    workflowDefinitionId: definition.id,
    workflowVersionId: definition.activeVersionId,
    input,
    trigger: "MANUAL",
    createdById: actor.user.id,
  });
  await executeWorkflowRun(run.id);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "workflow.run_triggered",
    entityType: "WorkflowRun",
    entityId: run.id,
    metadata: { workflowDefinitionId: definition.id },
  });

  return prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
}
