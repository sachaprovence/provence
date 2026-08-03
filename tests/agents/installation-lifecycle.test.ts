import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import {
  installAgent,
  transitionInstallation,
  updateInstallationGrants,
} from "@/lib/agents/installation-service";
import { ForbiddenError, ConflictError, ValidationError } from "@/lib/errors";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : cycle de vie
 * complet d'une installation d'agent — installation (plafond de
 * permissions/outils, moindre privilège), transitions de statut valides/
 * invalides, désinstallation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("cycle de vie d'une installation d'agent", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  it("installe un agent avec des droits qui restent un sous-ensemble de ce que la définition déclare", async () => {
    const { actor, definition, organization, user } = await createAgentTestFixture("install-ok");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    const installation = await installAgent(actor, {
      definitionId: definition.id,
      toolKeys: ["system.echo"],
      permissions: ["VIEW_WORKSPACE"],
    });

    expect(installation.status).toBe("INSTALLED");
    expect(installation.grantedToolKeys).toEqual(["system.echo"]);

    const installedLog = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "agent.installed", entityId: installation.id },
    });
    expect(installedLog).not.toBeNull();
  });

  it("refuse d'accorder un outil non déclaré par la définition (plafond)", async () => {
    const { actor, definition, organization, user } = await createAgentTestFixture("install-excess-tool");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    await expect(
      installAgent(actor, { definitionId: definition.id, toolKeys: ["database.query"], permissions: [] })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuse d'accorder une permission que l'acteur (humain) ne possède pas lui-même", async () => {
    const { actor, definition, organization, user } =
      await createAgentTestFixture("install-excess-permission");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    // Un acteur VIEWER ne possède pas MANAGE_FINANCE, même si la définition
    // le déclare — on simule en abaissant le rôle de l'acteur de test.
    const viewerActor = { ...actor, workspace: { ...actor.workspace, role: "VIEWER" as const } };
    const definitionWithFinance = await prisma.agentDefinition.update({
      where: { id: definition.id },
      data: { declaredPermissions: { push: "MANAGE_FINANCE" } },
    });

    await expect(
      installAgent(viewerActor, {
        definitionId: definitionWithFinance.id,
        toolKeys: [],
        permissions: ["MANAGE_FINANCE"],
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuse d'installer deux fois le même agent dans le même workspace", async () => {
    const { actor, definition, organization, user } = await createAgentTestFixture("install-duplicate");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    await installAgent(actor, { definitionId: definition.id, toolKeys: [], permissions: [] });
    await expect(
      installAgent(actor, { definitionId: definition.id, toolKeys: [], permissions: [] })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("applique les transitions de cycle de vie valides et refuse les invalides", async () => {
    const { actor, definition, organization, user } = await createAgentTestFixture("lifecycle");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    const installation = await installAgent(actor, {
      definitionId: definition.id,
      toolKeys: [],
      permissions: [],
    });

    // INSTALLED -> ACTIVE : valide.
    const activated = await transitionInstallation(actor, installation.id, "activate");
    expect(activated.status).toBe("ACTIVE");

    // ACTIVE -> ACTIVE via "activate" : invalide (pas dans la liste des transitions autorisées).
    await expect(transitionInstallation(actor, installation.id, "activate")).rejects.toBeInstanceOf(
      ValidationError
    );

    // ACTIVE -> SUSPENDED : valide.
    const suspended = await transitionInstallation(actor, installation.id, "suspend");
    expect(suspended.status).toBe("SUSPENDED");
    expect(suspended.suspendedAt).not.toBeNull();

    // SUSPENDED -> ACTIVE (resume) : valide.
    const resumed = await transitionInstallation(actor, installation.id, "resume");
    expect(resumed.status).toBe("ACTIVE");

    // ACTIVE -> UNINSTALLED : valide.
    const uninstalled = await transitionInstallation(actor, installation.id, "uninstall");
    expect(uninstalled.status).toBe("UNINSTALLED");
    expect(uninstalled.uninstalledAt).not.toBeNull();

    // UNINSTALLED -> tout : invalide (état terminal).
    await expect(transitionInstallation(actor, installation.id, "activate")).rejects.toBeInstanceOf(
      ValidationError
    );

    const auditActions = await prisma.auditLog.findMany({
      where: { organizationId: organization.id, entityId: installation.id },
      select: { action: true },
    });
    expect(auditActions.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "agent.installed",
        "agent.activated",
        "agent.suspended",
        "agent.resumed",
        "agent.uninstalled",
      ])
    );
  });

  it("met à jour les droits accordés en respectant toujours le plafond déclaré", async () => {
    const { actor, definition, organization, user } = await createAgentTestFixture("update-grants");
    organizationIds.push(organization.id);
    userIds.push(user.id);
    definitionIds.push(definition.id);

    const installation = await installAgent(actor, {
      definitionId: definition.id,
      toolKeys: [],
      permissions: [],
    });

    const updated = await updateInstallationGrants(actor, installation.id, {
      toolKeys: ["system.echo", "system.datetime"],
      permissions: ["VIEW_WORKSPACE"],
    });
    expect(updated.grantedToolKeys).toEqual(["system.echo", "system.datetime"]);

    await expect(
      updateInstallationGrants(actor, installation.id, { toolKeys: ["database.query"], permissions: [] })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
