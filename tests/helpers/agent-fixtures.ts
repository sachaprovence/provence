import { prisma } from "@/lib/prisma";
import { MembershipRole, WorkspaceRole, AgentDefinitionStatus } from "@/generated/prisma/enums";
import { DIAGNOSTIC_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/diagnostic-agent";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Fabrique une organisation + workspace + utilisateur (OWNER) + une
 * `AgentDefinition` de test (référençant le runtime de diagnostic déjà
 * enregistré) pour les tests d'intégration du Framework Agents. Miroir du
 * gabarit `tests/tenant-isolation/*.test.ts` (v0.2).
 */
export async function createAgentTestFixture(suffix: string) {
  const organization = await prisma.organization.create({ data: { name: `Org agents ${suffix}` } });
  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: `Workspace ${suffix}`,
      slug: "principal",
      isDefault: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `agents-${suffix}@example.test`,
      passwordHash: "not-a-real-hash",
      firstName: "Test",
      lastName: "Agents",
    },
  });
  const membership = await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN },
  });
  const workspaceMembership = await prisma.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER },
  });

  const definition = await prisma.agentDefinition.create({
    data: {
      organizationId: null,
      key: `test-diagnostic-agent-${suffix}`,
      name: "Agent de diagnostic (test)",
      author: "test",
      category: "system",
      status: AgentDefinitionStatus.PUBLISHED,
      runtimeKey: DIAGNOSTIC_AGENT_RUNTIME_KEY,
      declaredToolKeys: [
        "system.echo",
        "system.datetime",
        "system.workspace_info",
        "crm.leads_count_by_stage",
      ],
      declaredPermissions: ["VIEW_WORKSPACE"],
    },
  });

  const workspaceSummary = {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role: WorkspaceRole.OWNER,
    isDefault: true,
  };

  const actor: WorkspaceActor = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    membership: { id: membership.id, role: membership.role, territoryId: null },
    organization: { id: organization.id, name: organization.name },
    sessionId: "test-session",
    workspace: workspaceSummary,
    availableWorkspaces: [workspaceSummary],
  };

  return { organization, workspace, user, membership, workspaceMembership, definition, actor };
}

export async function cleanupAgentTestFixtures(
  organizationIds: string[],
  userIds: string[],
  definitionIds: string[] = []
) {
  // Ordre important : AgentInstallation.definitionId est en ON DELETE
  // RESTRICT (voir prisma/schema.prisma) — il faut supprimer les
  // organisations (qui cascadent vers AgentInstallation) avant de
  // supprimer les AgentDefinition de test, sous peine de violation de
  // contrainte de clé étrangère. On ne supprime que les définitions
  // créées par CE fichier de test (par id, jamais par un filtre large type
  // "startsWith") : Vitest exécute les fichiers de test en parallèle, un
  // filtre large supprimerait les définitions encore utilisées par un
  // autre fichier de test en cours d'exécution.
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  if (definitionIds.length > 0) {
    await prisma.agentDefinition.deleteMany({ where: { id: { in: definitionIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
