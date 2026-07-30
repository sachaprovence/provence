import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { setMemory, getMemory, listMemory, clearExpiredMemory } from "@/lib/agents/memory";
import {
  sendAgentMessage,
  listMessages,
  resolveInterventionRequest,
  listInterventionRequests,
} from "@/lib/agents/messaging";
import { createSchedule, processDueAgentSchedules } from "@/lib/agents/scheduler";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { ValidationError } from "@/lib/errors";
import { AgentMemoryScope, AgentMessageType, AgentScheduleKind } from "@/generated/prisma/enums";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("mémoire, communication et planification des agents", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  describe("mémoire", () => {
    it("écrit et relit une entrée persistante scopée à une installation", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("memory-persistent");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });

      await setMemory({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
        scope: AgentMemoryScope.PERSISTENT,
        key: "context",
        value: { step: 1 },
      });
      // Une seconde écriture sur la même clé met à jour, ne duplique pas.
      await setMemory({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
        scope: AgentMemoryScope.PERSISTENT,
        key: "context",
        value: { step: 2 },
      });

      const entry = await getMemory({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
        scope: AgentMemoryScope.PERSISTENT,
        key: "context",
      });
      expect(entry?.value).toEqual({ step: 2 });

      const all = await listMemory({ workspaceId: actor.workspace.id, installationId: installation.id });
      expect(all).toHaveLength(1);
    });

    it("une mémoire SHORT_TERM expirée n'est plus renvoyée par getMemory et est purgée par clearExpiredMemory", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("memory-expired");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });

      await setMemory({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
        scope: AgentMemoryScope.SHORT_TERM,
        key: "temp",
        value: "x",
        ttlMs: -1000, // déjà expiré
      });

      const entry = await getMemory({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
        scope: AgentMemoryScope.SHORT_TERM,
        key: "temp",
      });
      expect(entry).toBeNull();

      const cleared = await clearExpiredMemory();
      expect(cleared).toBeGreaterThanOrEqual(1);
    });

    it("refuse une mémoire SHARED rattachée à une installation, et une mémoire SHORT_TERM sans installation", async () => {
      const { actor, definition, organization, user } =
        await createAgentTestFixture("memory-scope-validation");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);

      await expect(
        setMemory({
          workspaceId: actor.workspace.id,
          installationId: "some-id",
          scope: AgentMemoryScope.SHARED,
          key: "k",
          value: 1,
        })
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        setMemory({
          workspaceId: actor.workspace.id,
          installationId: null,
          scope: AgentMemoryScope.SHORT_TERM,
          key: "k",
          value: 1,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("une mémoire SHARED est visible sans rattachement à une installation précise", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("memory-shared");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);

      await setMemory({
        workspaceId: actor.workspace.id,
        installationId: null,
        scope: AgentMemoryScope.SHARED,
        key: "shared-context",
        value: { note: "partagé" },
      });

      const entry = await getMemory({
        workspaceId: actor.workspace.id,
        installationId: null,
        scope: AgentMemoryScope.SHARED,
        key: "shared-context",
      });
      expect(entry?.value).toEqual({ note: "partagé" });
    });
  });

  describe("communication", () => {
    it("historise un message et crée une demande d'intervention pour un message de ce type", async () => {
      const { actor, definition, organization, user } =
        await createAgentTestFixture("messaging-intervention");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });

      const message = await sendAgentMessage({
        workspaceId: actor.workspace.id,
        fromInstallationId: installation.id,
        type: AgentMessageType.INTERVENTION_REQUEST,
        payload: { title: "Besoin d'une validation humaine", description: "Cas ambigu détecté." },
      });

      const messages = await listMessages({
        workspaceId: actor.workspace.id,
        installationId: installation.id,
      });
      expect(messages.map((m) => m.id)).toContain(message.id);

      const interventions = await listInterventionRequests({ workspaceId: actor.workspace.id });
      expect(interventions.some((i) => i.messageId === message.id)).toBe(true);
    });

    it("résout une demande d'intervention et journalise la résolution", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("messaging-resolve");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });

      const message = await sendAgentMessage({
        workspaceId: actor.workspace.id,
        fromInstallationId: installation.id,
        type: AgentMessageType.INTERVENTION_REQUEST,
        payload: { title: "À valider" },
      });
      const [intervention] = await listInterventionRequests({
        workspaceId: actor.workspace.id,
        status: "PENDING",
      });
      expect(intervention.messageId).toBe(message.id);

      const resolved = await resolveInterventionRequest({
        organizationId: organization.id,
        workspaceId: actor.workspace.id,
        interventionId: intervention.id,
        resolvedById: actor.user.id,
        status: "RESOLVED",
      });
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolvedAt).not.toBeNull();

      const resolvedLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: organization.id,
          action: "agent.intervention_resolved",
          entityId: intervention.id,
        },
      });
      expect(resolvedLog).not.toBeNull();
    });
  });

  describe("planification", () => {
    it("une planification ponctuelle due crée une exécution puis se désactive", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("scheduler-oneoff");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });
      await transitionInstallation(actor, installation.id, "activate");

      const schedule = await createSchedule({
        installationId: installation.id,
        kind: AgentScheduleKind.ONE_OFF,
        runAt: new Date(Date.now() - 1000), // déjà due
      });

      const results = await processDueAgentSchedules();
      expect(results.some((r) => r.scheduleId === schedule.id && r.ok)).toBe(true);

      const runs = await prisma.agentRun.findMany({ where: { installationId: installation.id } });
      expect(runs.length).toBeGreaterThanOrEqual(1);

      const updatedSchedule = await prisma.agentSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      expect(updatedSchedule.isActive).toBe(false);
    });

    it("ignore une planification dont l'installation n'est pas active", async () => {
      const { actor, definition, organization, user } = await createAgentTestFixture("scheduler-inactive");
      organizationIds.push(organization.id);
      userIds.push(user.id);
      definitionIds.push(definition.id);
      const installation = await installAgent(actor, {
        definitionId: definition.id,
        toolKeys: [],
        permissions: [],
      });
      // Jamais activé : reste INSTALLED.

      const schedule = await createSchedule({
        installationId: installation.id,
        kind: AgentScheduleKind.ONE_OFF,
        runAt: new Date(Date.now() - 1000),
      });

      await processDueAgentSchedules();

      const runs = await prisma.agentRun.findMany({ where: { installationId: installation.id } });
      expect(runs).toHaveLength(0);

      const updatedSchedule = await prisma.agentSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      expect(updatedSchedule.isActive).toBe(false); // désactivée malgré tout (ponctuelle traitée une seule fois)
    });
  });
});
