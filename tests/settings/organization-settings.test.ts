import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { organizationSettingsSchema } from "@/lib/validations/organization";

/**
 * Réglages "Entreprise" (task #92) — logo, TVA, SIRET, adresse légale,
 * téléphone, préfixes devis/facture : champs déjà présents dans le schéma
 * Prisma (task #80, alimentent les PDF de devis/factures via
 * `commercial-document-pdf.ts`/`invoice-service.ts`) mais jusque-là jamais
 * exposés dans `organizationSettingsSchema` ni le formulaire de Paramètres.
 */
describe("organizationSettingsSchema — coordonnées légales/TVA/logo", () => {
  it("accepte les nouveaux champs facultatifs", () => {
    const parsed = organizationSettingsSchema.safeParse({
      name: "Provence 360",
      logoUrl: "https://example.test/logo.png",
      vatNumber: "FR12345678900",
      siret: "12345678900012",
      legalAddress: "12 rue Exemple, 84000 Avignon",
      phone: "+33400000000",
      invoicePrefix: "FA",
      quotePrefix: "DEV",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.vatNumber).toBe("FR12345678900");
      expect(parsed.data.invoicePrefix).toBe("FA");
    }
  });

  it("reste valide sans ces champs (rétrocompatible)", () => {
    const parsed = organizationSettingsSchema.safeParse({ name: "Provence 360" });
    expect(parsed.success).toBe(true);
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Persistance des coordonnées légales/TVA/logo sur Organization", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("enregistre puis relit logo/TVA/SIRET/adresse/téléphone/préfixes", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org réglages entreprise" } });
    organizationIds.push(organization.id);

    const parsed = organizationSettingsSchema.parse({
      name: organization.name,
      logoUrl: "https://example.test/logo.png",
      vatNumber: "FR12345678900",
      siret: "12345678900012",
      legalAddress: "12 rue Exemple, 84000 Avignon",
      phone: "+33400000000",
      invoicePrefix: "FACT",
      quotePrefix: "DV",
    });
    const updated = await prisma.organization.update({ where: { id: organization.id }, data: parsed });

    expect(updated.logoUrl).toBe("https://example.test/logo.png");
    expect(updated.vatNumber).toBe("FR12345678900");
    expect(updated.siret).toBe("12345678900012");
    expect(updated.legalAddress).toBe("12 rue Exemple, 84000 Avignon");
    expect(updated.phone).toBe("+33400000000");
    expect(updated.invoicePrefix).toBe("FACT");
    expect(updated.quotePrefix).toBe("DV");
  });
});
