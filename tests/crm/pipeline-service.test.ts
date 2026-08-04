import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPipelineStages, updatePipelineStage, reorderPipelineStages, buildStageChangedEventPayload } from "@/lib/crm/pipeline-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { LeadStage, PipelineStageCategory } from "@/generated/prisma/enums";
import { PIPELINE_STAGES } from "@/lib/labels";

/**
 * `buildStageChangedEventPayload` (v1.1, AR-0165) — fonction pure, testée
 * sans base de données : décide seule si `PUT /api/leads/[id]` doit publier
 * `lead.stage_changed` (route non testable directement, dépend de
 * `next/headers` via `requireActorApi`).
 */
describe("CRM v1.1 — buildStageChangedEventPayload", () => {
  it("construit le payload quand l'étape change réellement", () => {
    const payload = buildStageChangedEventPayload("org-1", "lead-1", LeadStage.NEW, LeadStage.QUALIFIED);
    expect(payload).toEqual({ organizationId: "org-1", leadId: "lead-1", previousStage: LeadStage.NEW, newStage: LeadStage.QUALIFIED });
  });

  it("ne publie rien si la nouvelle étape est identique à l'ancienne", () => {
    expect(buildStageChangedEventPayload("org-1", "lead-1", LeadStage.NEGOTIATION, LeadStage.NEGOTIATION)).toBeNull();
  });

  it("ne publie rien si `stage` n'était pas fourni dans la mise à jour", () => {
    expect(buildStageChangedEventPayload("org-1", "lead-1", LeadStage.NEGOTIATION, undefined)).toBeNull();
  });
});

/**
 * `PipelineStage` (v0.9, ADR 0038) : personnalisation d'affichage du
 * pipeline, jamais la source de vérité métier (`Lead.stage` reste l'enum
 * `LeadStage`, inchangé). Vérifie le seed paresseux 1:1 avec `LeadStage`,
 * la mise à jour label/couleur/catégorie, le réordonnancement, et
 * l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v0.9 — PipelineStage", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org pipeline ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("seed paresseusement une étape par valeur de LeadStage, dans l'ordre existant", async () => {
    const organization = await createOrg("seed");
    const stages = await getPipelineStages(organization.id);

    expect(stages).toHaveLength(PIPELINE_STAGES.length);
    expect(stages.map((s) => s.stageKey)).toEqual(expect.arrayContaining(Object.values(LeadStage)));
    expect(stages[0].order).toBe(0);
    expect(stages.every((s, i) => (i === 0 ? true : s.order > stages[i - 1].order))).toBe(true);
  });

  it("est idempotent : un second appel ne duplique pas les lignes", async () => {
    const organization = await createOrg("idempotent");
    await getPipelineStages(organization.id);
    const second = await getPipelineStages(organization.id);
    expect(second).toHaveLength(PIPELINE_STAGES.length);
  });

  it("met à jour le libellé/couleur/catégorie d'une étape sans jamais toucher à Lead.stage", async () => {
    const organization = await createOrg("update");
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: "Test", stage: LeadStage.NEGOTIATION },
    });

    const updated = await updatePipelineStage(organization.id, LeadStage.NEGOTIATION, {
      label: "En négociation active",
      color: "#123456",
      category: PipelineStageCategory.OPEN,
    });
    expect(updated.label).toBe("En négociation active");
    expect(updated.color).toBe("#123456");

    const refreshedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(refreshedLead?.stage).toBe(LeadStage.NEGOTIATION);
  });

  it("rejette la mise à jour d'une étape absente de l'organisation", async () => {
    const organization = await createOrg("not-found");
    await getPipelineStages(organization.id);
    await prisma.pipelineStage.delete({
      where: { organizationId_stageKey: { organizationId: organization.id, stageKey: LeadStage.NEW } },
    });

    await expect(updatePipelineStage(organization.id, LeadStage.NEW, { label: "x" })).rejects.toThrow(NotFoundError);
  });

  it("réordonne l'ensemble des étapes et rejette une liste incomplète", async () => {
    const organization = await createOrg("reorder");
    await getPipelineStages(organization.id);

    const allStages = Object.values(LeadStage);
    const reversed = [...allStages].reverse();
    const reordered = await reorderPipelineStages(organization.id, reversed);
    expect(reordered.find((s) => s.stageKey === reversed[0])?.order).toBe(0);

    await expect(reorderPipelineStages(organization.id, [LeadStage.NEW])).rejects.toThrow(ValidationError);
  });

  it("isolation multi-tenant : les étapes d'une organisation ne sont jamais visibles/modifiables par une autre", async () => {
    const orgA = await createOrg("isolation-a");
    const orgB = await createOrg("isolation-b");
    await getPipelineStages(orgA.id);

    await expect(updatePipelineStage(orgB.id, LeadStage.NEW, { label: "Piraté" })).resolves.toBeDefined();
    const stageA = await prisma.pipelineStage.findUnique({
      where: { organizationId_stageKey: { organizationId: orgA.id, stageKey: LeadStage.NEW } },
    });
    expect(stageA?.label).not.toBe("Piraté");
  });
});
