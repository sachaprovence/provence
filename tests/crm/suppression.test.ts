import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { isSuppressed, addSuppression } from "@/lib/suppression";
import { SuppressionReason } from "@/generated/prisma/enums";

/**
 * Liste de suppression RGPD/CAN-SPAM (v0.10, AR-0158) — jusqu'ici sans
 * aucun test alors qu'elle porte une obligation de conformité (un email
 * désinscrit ne doit plus jamais être contacté) et conditionne l'envoi
 * réel dans `sequence-engine.ts`/`sendMessageNow`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isSuppressed / addSuppression", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org suppression ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("un email/téléphone jamais exclu n'est pas suppressé", async () => {
    const organization = await createOrg("none");
    expect(await isSuppressed(organization.id, "jamais-exclu@example.test")).toBe(false);
  });

  it("sans email ni téléphone fourni, renvoie toujours false (rien à vérifier)", async () => {
    const organization = await createOrg("no-contact");
    expect(await isSuppressed(organization.id, null, null)).toBe(false);
  });

  it("addSuppression puis isSuppressed bloque explicitement l'email désinscrit", async () => {
    const organization = await createOrg("email");
    await addSuppression({ organizationId: organization.id, email: "exclu@example.test", reason: SuppressionReason.UNSUBSCRIBED });

    expect(await isSuppressed(organization.id, "exclu@example.test")).toBe(true);
    expect(await isSuppressed(organization.id, "autre@example.test")).toBe(false);
  });

  it("addSuppression fonctionne aussi par téléphone seul", async () => {
    const organization = await createOrg("phone");
    await addSuppression({ organizationId: organization.id, phone: "+33600000000", reason: SuppressionReason.MANUAL_EXCLUSION });

    expect(await isSuppressed(organization.id, null, "+33600000000")).toBe(true);
    expect(await isSuppressed(organization.id, null, "+33611111111")).toBe(false);
  });

  it("addSuppression exige un email ou un téléphone", async () => {
    const organization = await createOrg("invalid");
    await expect(addSuppression({ organizationId: organization.id, reason: SuppressionReason.MANUAL_EXCLUSION })).rejects.toThrow(
      /email ou un téléphone est requis/
    );
  });

  it("addSuppression est idempotent pour un même email (upsert, jamais de doublon)", async () => {
    const organization = await createOrg("upsert");
    await addSuppression({ organizationId: organization.id, email: "double@example.test", reason: SuppressionReason.BOUNCED });
    await addSuppression({ organizationId: organization.id, email: "double@example.test", reason: SuppressionReason.COMPLAINT, note: "mise à jour" });

    const entries = await prisma.suppressionEntry.findMany({ where: { organizationId: organization.id, email: "double@example.test" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe(SuppressionReason.COMPLAINT);
    expect(entries[0].note).toBe("mise à jour");
  });

  it("isolation multi-tenant : une exclusion d'une organisation ne bloque jamais une autre", async () => {
    const orgA = await createOrg("tenant-a");
    const orgB = await createOrg("tenant-b");
    await addSuppression({ organizationId: orgA.id, email: "partage@example.test", reason: SuppressionReason.UNSUBSCRIBED });

    expect(await isSuppressed(orgA.id, "partage@example.test")).toBe(true);
    expect(await isSuppressed(orgB.id, "partage@example.test")).toBe(false);
  });
});
