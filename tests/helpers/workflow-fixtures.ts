import { prisma } from "@/lib/prisma";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Fabrique une organisation + workspace + utilisateur (OWNER) pour les
 * tests du Workflow Engine (v0.6) — même gabarit que
 * `createAgentTestFixture` (tests/helpers/agent-fixtures.ts).
 */
export async function createWorkflowTestFixture(suffix: string) {
  const organization = await prisma.organization.create({ data: { name: `Org workflows ${suffix}` } });
  const workspace = await prisma.workspace.create({
    data: { organizationId: organization.id, name: `Workspace ${suffix}`, slug: "principal", isDefault: true },
  });
  const user = await prisma.user.create({
    data: { email: `workflows-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "Workflows" },
  });
  const membership = await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN },
  });
  const workspaceMembership = await prisma.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER },
  });

  const workspaceSummary = { id: workspace.id, name: workspace.name, slug: workspace.slug, role: WorkspaceRole.OWNER, isDefault: true };
  const actor: WorkspaceActor = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    membership: { id: membership.id, role: membership.role, territoryId: null },
    organization: { id: organization.id, name: organization.name },
    sessionId: "test-session",
    isPlatformAdmin: false,
    workspace: workspaceSummary,
    availableWorkspaces: [workspaceSummary],
  };

  return { organization, workspace, user, membership, workspaceMembership, actor };
}

/** Crée une `WorkflowDefinition` + `WorkflowVersion` déjà `ACTIVE` (raccourci pour les tests qui n'exercent pas le service de cycle de vie lui-même). */
export async function createActiveWorkflow(params: {
  organizationId: string;
  workspaceId: string;
  key: string;
  graph: WorkflowGraph;
  createdById?: string;
}) {
  const definition = await prisma.workflowDefinition.create({
    data: {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      key: params.key,
      name: params.key,
      category: "test",
      status: "ACTIVE",
      createdById: params.createdById,
    },
  });
  const version = await prisma.workflowVersion.create({
    data: { workflowDefinitionId: definition.id, version: 1, graph: params.graph as never, createdById: params.createdById },
  });
  await prisma.workflowDefinition.update({ where: { id: definition.id }, data: { activeVersionId: version.id } });
  return { definition: { ...definition, activeVersionId: version.id }, version };
}

export async function cleanupWorkflowTestFixtures(organizationIds: string[], userIds: string[]) {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
