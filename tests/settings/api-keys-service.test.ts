import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/settings/api-keys-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { hashApiKey } from "@/lib/public-api/auth";

/** Gestion des clés API en self-service (v1.0, AR-0059). */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("createApiKey / listApiKeys / revokeApiKey", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function setup(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org clé API ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `apikey-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "ApiKey" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("createApiKey renvoie la clé en clair une seule fois, jamais retrouvable ensuite", async () => {
    const { organization, user } = await setup("create");
    const { rawKey, preview } = await createApiKey({ organizationId: organization.id, name: "Test", createdById: user.id });

    expect(rawKey).toMatch(/^ak_live_/);
    expect(preview.keyPrefix).toBe(rawKey.slice(0, preview.keyPrefix.length));

    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: preview.id } });
    expect(stored.hashedKey).toBe(hashApiKey(rawKey));
    expect(JSON.stringify(preview)).not.toContain(rawKey);
  });

  it("createApiKey rejette un nom vide", async () => {
    const { organization, user } = await setup("empty-name");
    await expect(createApiKey({ organizationId: organization.id, name: "  ", createdById: user.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("listApiKeys isole strictement par organisation", async () => {
    const orgA = await setup("list-a");
    const orgB = await setup("list-b");
    const { preview } = await createApiKey({ organizationId: orgA.organization.id, name: "Clé A", createdById: orgA.user.id });
    await createApiKey({ organizationId: orgB.organization.id, name: "Clé B", createdById: orgB.user.id });

    const keysForA = await listApiKeys(orgA.organization.id);
    expect(keysForA.map((k) => k.id)).toEqual([preview.id]);
  });

  it("revokeApiKey marque la clé révoquée, et échoue explicitement pour une clé d'une autre organisation", async () => {
    const orgA = await setup("revoke-a");
    const orgB = await setup("revoke-b");
    const { preview } = await createApiKey({ organizationId: orgA.organization.id, name: "À révoquer", createdById: orgA.user.id });

    await expect(revokeApiKey(orgB.organization.id, preview.id)).rejects.toBeInstanceOf(NotFoundError);

    await revokeApiKey(orgA.organization.id, preview.id);
    const revoked = await prisma.apiKey.findUniqueOrThrow({ where: { id: preview.id } });
    expect(revoked.revokedAt).not.toBeNull();
  });
});
