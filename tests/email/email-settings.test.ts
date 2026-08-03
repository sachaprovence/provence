import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveEmailConfig, updateEmailIntegrationConfig, getEmailConfigPreview } from "@/lib/email/config";

/**
 * Réglages email (task #92) — le formulaire de Paramètres écrit dans
 * `Integration.config` (kind EMAIL) via `updateEmailIntegrationConfig` et le
 * relit via `getEmailConfigPreview`, JAMAIS en clair pour les secrets
 * (`smtpPassword`/`apiKey`) — seulement un booléen "déjà enregistré". Une
 * mise à jour qui laisse un secret vide ne doit jamais effacer un secret déjà
 * enregistré (fusion, pas remplacement).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Réglages email — updateEmailIntegrationConfig / getEmailConfigPreview", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org réglages email ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("crée l'intégration EMAIL au premier enregistrement, marquée CONNECTED", async () => {
    const organization = await createOrg("create");
    await updateEmailIntegrationConfig(organization.id, { smtpHost: "smtp.example.test", smtpPort: 587 });

    const integration = await prisma.integration.findFirstOrThrow({ where: { organizationId: organization.id, kind: "EMAIL" } });
    expect(integration.status).toBe("CONNECTED");
    expect((integration.config as Record<string, unknown>).smtpHost).toBe("smtp.example.test");
  });

  it("l'aperçu ne renvoie jamais les secrets en clair, seulement leur présence", async () => {
    const organization = await createOrg("preview-no-secrets");
    await updateEmailIntegrationConfig(organization.id, { smtpHost: "smtp.example.test", smtpPassword: "s3cr3t", apiKey: "api-key-value" });

    const preview = await getEmailConfigPreview(organization.id);
    expect(preview.hasSmtpPassword).toBe(true);
    expect(preview.hasApiKey).toBe(true);
    expect(JSON.stringify(preview)).not.toContain("s3cr3t");
    expect(JSON.stringify(preview)).not.toContain("api-key-value");
  });

  it("un secret laissé vide dans une mise à jour ne remplace jamais un secret déjà enregistré", async () => {
    const organization = await createOrg("merge-preserves-secret");
    await updateEmailIntegrationConfig(organization.id, { smtpHost: "smtp.example.test", smtpPassword: "original-secret" });

    // Deuxième mise à jour : change seulement l'hôte, ne fournit pas de mot de passe (chaîne vide, comme un champ de formulaire non modifié).
    await updateEmailIntegrationConfig(organization.id, { smtpHost: "smtp2.example.test", smtpPassword: "" });

    const config = await resolveEmailConfig(organization.id);
    expect(config.smtpHost).toBe("smtp2.example.test");
    expect(config.smtpPassword).toBe("original-secret");
  });

  it("isolation multi-tenant : la configuration d'une organisation n'affecte jamais une autre", async () => {
    const orgA = await createOrg("tenant-a");
    const orgB = await createOrg("tenant-b");
    await updateEmailIntegrationConfig(orgA.id, { smtpHost: "smtp-a.example.test" });

    const configB = await resolveEmailConfig(orgB.id);
    expect(configB.smtpHost).toBeUndefined();
  });
});
