import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, resolvePublicApiActor } from "@/lib/public-api/auth";
import { assertPublicApiRateLimitAvailable } from "@/lib/rate-limit";
import { clearRateLimitBuckets } from "@/lib/security/rate-limiter";
import { UnauthorizedError, TooManyRequestsError } from "@/lib/errors";
import { GET as listLeads } from "@/app/api/public/v1/leads/route";
import { GET as getLead } from "@/app/api/public/v1/leads/[id]/route";
import { GET as listOpportunities } from "@/app/api/public/v1/opportunities/route";
import { GET as getOpportunity } from "@/app/api/public/v1/opportunities/[id]/route";
import { GET as listInvoices } from "@/app/api/public/v1/invoices/route";
import { GET as getInvoice } from "@/app/api/public/v1/invoices/[id]/route";

/**
 * API publique en lecture (v1.0, AR-0059) + limitation de débit (AR-0060) —
 * vérifie : authentification par clé API (jamais la valeur en clair
 * conservée), isolation multi-tenant stricte sur les 3 domaines exposés
 * (prospects/opportunités/factures), et blocage réel au-delà du débit
 * autorisé.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function requestWithKey(url: string, rawKey?: string) {
  return new Request(url, { headers: rawKey ? { authorization: `Bearer ${rawKey}` } : undefined });
}

runIfDatabase("resolvePublicApiActor", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrgWithKey(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org API publique ${suffix}` } });
    organizationIds.push(organization.id);
    const { rawKey, keyPrefix, hashedKey } = generateApiKey();
    const apiKey = await prisma.apiKey.create({ data: { organizationId: organization.id, name: "Test", keyPrefix, hashedKey } });
    return { organization, rawKey, apiKey };
  }

  it("résout l'organisation propriétaire d'une clé API valide", async () => {
    const { organization, rawKey } = await createOrgWithKey("valid");
    const actor = await resolvePublicApiActor(requestWithKey("http://localhost/api/public/v1/leads", rawKey));
    expect(actor.organizationId).toBe(organization.id);
  });

  it("échoue explicitement sans en-tête Authorization", async () => {
    await expect(resolvePublicApiActor(requestWithKey("http://localhost/api/public/v1/leads"))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("échoue explicitement pour une clé invalide", async () => {
    await expect(resolvePublicApiActor(requestWithKey("http://localhost/api/public/v1/leads", "ak_live_invalide"))).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("échoue explicitement pour une clé révoquée", async () => {
    const { rawKey, apiKey } = await createOrgWithKey("revoked");
    await prisma.apiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } });

    await expect(resolvePublicApiActor(requestWithKey("http://localhost/api/public/v1/leads", rawKey))).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("met à jour lastUsedAt à chaque résolution réussie", async () => {
    const { rawKey, apiKey } = await createOrgWithKey("last-used");
    await resolvePublicApiActor(requestWithKey("http://localhost/api/public/v1/leads", rawKey));

    const updated = await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } });
    expect(updated.lastUsedAt).not.toBeNull();
  });

  it("jamais la valeur en clair de la clé n'est conservée en base", async () => {
    const { rawKey, apiKey } = await createOrgWithKey("no-plaintext");
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } });
    expect(stored.hashedKey).not.toBe(rawKey);
    expect(stored.hashedKey).toBe(hashApiKey(rawKey));
  });
});

describe("assertPublicApiRateLimitAvailable", () => {
  afterEach(() => {
    clearRateLimitBuckets();
  });

  it("bloque explicitement au-delà de 60 requêtes/minute pour une même clé", () => {
    const apiKeyId = "test-rate-limit-key";
    for (let i = 0; i < 60; i++) {
      expect(() => assertPublicApiRateLimitAvailable(apiKeyId)).not.toThrow();
    }
    expect(() => assertPublicApiRateLimitAvailable(apiKeyId)).toThrow(TooManyRequestsError);
  });

  it("n'affecte jamais une autre clé", () => {
    for (let i = 0; i < 60; i++) assertPublicApiRateLimitAvailable("key-a");
    expect(() => assertPublicApiRateLimitAvailable("key-b")).not.toThrow();
  });
});

runIfDatabase("routes GET /api/public/v1/* — isolation multi-tenant", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });
  afterEach(() => {
    clearRateLimitBuckets();
  });

  async function createOrgWithData(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org API données ${suffix}` } });
    organizationIds.push(organization.id);
    const { rawKey, keyPrefix, hashedKey } = generateApiKey();
    await prisma.apiKey.create({ data: { organizationId: organization.id, name: "Test", keyPrefix, hashedKey } });

    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: `Prospect ${suffix}` } });
    const opportunity = await prisma.opportunity.create({
      data: { organizationId: organization.id, leadId: lead.id, name: `Opportunité ${suffix}`, estimatedValue: 10000 },
    });
    const invoice = await prisma.invoice.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: `FA-${suffix}`, totalAmount: 12000, vatAmount: 2000 },
    });

    return { organization, rawKey, lead, opportunity, invoice };
  }

  it("GET /leads liste uniquement les prospects de l'organisation de la clé, jamais 401 sans clé", async () => {
    const orgA = await createOrgWithData("leads-a");
    const orgB = await createOrgWithData("leads-b");

    const resA = await listLeads(requestWithKey("http://localhost/api/public/v1/leads", orgA.rawKey));
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.data.map((l: { id: string }) => l.id)).toContain(orgA.lead.id);
    expect(bodyA.data.map((l: { id: string }) => l.id)).not.toContain(orgB.lead.id);

    const resNoKey = await listLeads(requestWithKey("http://localhost/api/public/v1/leads"));
    expect(resNoKey.status).toBe(401);
  });

  it("GET /leads/[id] renvoie 404 (jamais les données) pour un prospect d'une autre organisation", async () => {
    const orgA = await createOrgWithData("leads-spoof-a");
    const orgB = await createOrgWithData("leads-spoof-b");

    const res = await getLead(requestWithKey("http://localhost/api/public/v1/leads", orgA.rawKey), { params: Promise.resolve({ id: orgB.lead.id }) });
    expect(res.status).toBe(404);
  });

  it("GET /opportunities isole strictement par organisation", async () => {
    const orgA = await createOrgWithData("opp-a");
    const orgB = await createOrgWithData("opp-b");

    const res = await listOpportunities(requestWithKey("http://localhost/api/public/v1/opportunities", orgA.rawKey));
    const body = await res.json();
    expect(body.data.map((o: { id: string }) => o.id)).toContain(orgA.opportunity.id);
    expect(body.data.map((o: { id: string }) => o.id)).not.toContain(orgB.opportunity.id);

    const spoofRes = await getOpportunity(requestWithKey("http://localhost/api/public/v1/opportunities", orgA.rawKey), {
      params: Promise.resolve({ id: orgB.opportunity.id }),
    });
    expect(spoofRes.status).toBe(404);
  });

  it("GET /invoices isole strictement par organisation", async () => {
    const orgA = await createOrgWithData("inv-a");
    const orgB = await createOrgWithData("inv-b");

    const res = await listInvoices(requestWithKey("http://localhost/api/public/v1/invoices", orgA.rawKey));
    const body = await res.json();
    expect(body.data.map((i: { id: string }) => i.id)).toContain(orgA.invoice.id);
    expect(body.data.map((i: { id: string }) => i.id)).not.toContain(orgB.invoice.id);

    const spoofRes = await getInvoice(requestWithKey("http://localhost/api/public/v1/invoices", orgA.rawKey), {
      params: Promise.resolve({ id: orgB.invoice.id }),
    });
    expect(spoofRes.status).toBe(404);
  });

  it("une clé invalide échoue avec 401 sur toutes les routes", async () => {
    for (const route of [listLeads, listOpportunities, listInvoices]) {
      const res = await route(requestWithKey("http://localhost/api/public/v1/x", "ak_live_invalide"));
      expect(res.status).toBe(401);
    }
  });
});
