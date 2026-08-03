import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeQuoteTotals } from "@/lib/crm/quote-pricing";
import {
  createQuote,
  updateQuoteDraft,
  sendQuote,
  requestQuoteSignature,
  recordSignatureResult,
} from "@/lib/crm/quote-service";
import { generateQuotePdf } from "@/lib/crm/quote-pdf";
import { ConflictError } from "@/lib/errors";
import { QuoteStatus, QuoteSignatureStatus } from "@/generated/prisma/enums";

/**
 * Devis v0.9 (ADR 0038) : remise/TVA/versionnement/PDF/signature
 * électronique (abstraction). `totalAmount` reste le TTC final déjà utilisé
 * ailleurs (timeline, dashboards) — jamais renommé.
 */
describe("computeQuoteTotals", () => {
  it("calcule sous-total, remise, TVA et total TTC", () => {
    const totals = computeQuoteTotals([{ quantity: 2, unitPrice: 10000 }], 10, 20);
    expect(totals.subtotalAmount).toBe(20000);
    expect(totals.discountAmount).toBe(2000);
    expect(totals.vatAmount).toBe(3600); // (20000 - 2000) * 0.20
    expect(totals.totalAmount).toBe(21600);
  });

  it("gère l'absence de remise et de TVA", () => {
    const totals = computeQuoteTotals([{ quantity: 1, unitPrice: 5000 }], 0, 0);
    expect(totals).toEqual({ subtotalAmount: 5000, discountAmount: 0, vatAmount: 0, totalAmount: 5000 });
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v0.9 — Quote service (remise/TVA/versionnement/signature)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgWithLead(suffix: string) {
    const organization = await prisma.organization.create({
      data: { name: `Org quote ${suffix}`, siret: "12345678900012", vatNumber: "FR12345678900" },
    });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}`, address: "1 rue du Test", city: "Avignon" },
    });
    const user = await prisma.user.create({
      data: { email: `quote-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, lead, user };
  }

  it("crée un devis avec remise/TVA et calcule le total TTC", async () => {
    const { organization, lead } = await createOrgWithLead("create");

    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      discountPercent: 10,
      vatRate: 20,
      lines: [{ label: "Visite virtuelle", quantity: 1, unitPrice: 25000 }],
    });

    expect(quote.subtotalAmount).toBe(25000);
    expect(quote.vatAmount).toBe(4500); // (25000 - 2500) * 0.20
    expect(quote.totalAmount).toBe(27000);
  });

  it("permet de modifier un devis DRAFT et recalcule les totaux, mais rejette la modification d'un devis envoyé", async () => {
    const { organization, lead, user } = await createOrgWithLead("draft-immutable");
    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      lines: [{ label: "Visite virtuelle", quantity: 1, unitPrice: 10000 }],
    });

    const updated = await updateQuoteDraft(organization.id, quote.id, { discountPercent: 20 });
    expect(updated.discountPercent).toBe(20);
    expect(updated.totalAmount).toBe(Math.round(10000 * 0.8 * 1.2));

    await sendQuote(organization.id, quote.id, user.id);
    await expect(updateQuoteDraft(organization.id, quote.id, { discountPercent: 50 })).rejects.toThrow(ConflictError);
  });

  it("l'envoi d'un devis crée une QuoteVersion immuable et fait passer le Lead en QUOTE_SENT", async () => {
    const { organization, lead, user } = await createOrgWithLead("send-versioning");
    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      lines: [{ label: "Visite virtuelle", quantity: 1, unitPrice: 15000 }],
    });

    const sent = await sendQuote(organization.id, quote.id, user.id);
    expect(sent.status).toBe(QuoteStatus.SENT);

    const versions = await prisma.quoteVersion.findMany({ where: { quoteId: quote.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].totalAmount).toBe(quote.totalAmount);

    const refreshedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(refreshedLead?.stage).toBe("QUOTE_SENT");

    await expect(sendQuote(organization.id, quote.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("le flux de signature électronique (abstraction démo) passe par PENDING puis SIGNED, et fait passer le devis à ACCEPTED", async () => {
    const { organization, lead, user } = await createOrgWithLead("signature");
    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      lines: [{ label: "Visite virtuelle", quantity: 1, unitPrice: 20000 }],
    });
    await sendQuote(organization.id, quote.id, user.id);

    const pending = await requestQuoteSignature(organization.id, quote.id, {
      signerName: "Jean Dupont",
      signerEmail: "jean@example.test",
    });
    expect(pending.signatureStatus).toBe(QuoteSignatureStatus.PENDING);
    expect(pending.signatureProvider).toBe("demo");

    const signed = await recordSignatureResult(organization.id, quote.id, "SIGNED");
    expect(signed.signatureStatus).toBe(QuoteSignatureStatus.SIGNED);
    expect(signed.status).toBe(QuoteStatus.ACCEPTED);

    await expect(recordSignatureResult(organization.id, quote.id, "SIGNED")).rejects.toThrow(ConflictError);
  });

  it("génère un PDF valide (en-tête %PDF) pour un devis", async () => {
    const { organization, lead } = await createOrgWithLead("pdf");
    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      discountPercent: 5,
      vatRate: 20,
      lines: [{ label: "Visite virtuelle 360°", quantity: 1, unitPrice: 30000 }],
    });
    const fullQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id }, include: { lines: true } });
    const fullOrganization = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });

    const pdfBytes = await generateQuotePdf({ organization: fullOrganization, quote: fullQuote, lines: fullQuote.lines, lead });

    expect(pdfBytes.length).toBeGreaterThan(100);
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8");
    expect(header).toBe("%PDF-");
  });
});
