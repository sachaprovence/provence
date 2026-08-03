import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createQuote, sendQuote, requestQuoteSignature, recordSignatureResult } from "@/lib/crm/quote-service";
import { convertQuoteToInvoice, listInvoices, getInvoice, updateInvoiceStatus } from "@/lib/crm/invoice-service";
import { generateInvoicePdf } from "@/lib/crm/invoice-pdf";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { QuoteStatus, InvoiceStatus } from "@/generated/prisma/enums";

/**
 * Facturation v0.9 (ADR 0038) : conversion Quote(ACCEPTED) -> Invoice
 * TOUJOURS explicite, jamais automatique. `Invoice` est un modèle séparé
 * avec son propre cycle de vie (DRAFT/SENT/PAID/OVERDUE/CANCELLED).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v0.9 — Invoice service (conversion depuis un devis)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createAcceptedQuote(suffix: string) {
    const organization = await prisma.organization.create({
      data: { name: `Org invoice ${suffix}`, invoicePrefix: "FA" },
    });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` },
    });
    const user = await prisma.user.create({
      data: { email: `invoice-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);

    const quote = await createQuote(organization.id, {
      leadId: lead.id,
      discountPercent: 10,
      vatRate: 20,
      lines: [{ label: "Visite virtuelle", quantity: 1, unitPrice: 25000 }],
    });
    await sendQuote(organization.id, quote.id, user.id);
    await requestQuoteSignature(organization.id, quote.id, { signerName: "Jean Dupont", signerEmail: "jean@example.test" });
    await recordSignatureResult(organization.id, quote.id, "SIGNED");

    const acceptedQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(acceptedQuote.status).toBe(QuoteStatus.ACCEPTED);

    return { organization, lead, user, quote: acceptedQuote };
  }

  it("transforme un devis accepté en facture, avec les mêmes montants et lignes", async () => {
    const { organization, lead, user, quote } = await createAcceptedQuote("convert");

    const invoice = await convertQuoteToInvoice(organization.id, quote.id, user.id);

    expect(invoice.leadId).toBe(lead.id);
    expect(invoice.quoteId).toBe(quote.id);
    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.totalAmount).toBe(quote.totalAmount);
    expect(invoice.vatAmount).toBe(quote.vatAmount);
    expect(invoice.reference).toMatch(/^FA-\d{4}-0001$/);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].label).toBe("Visite virtuelle");
  });

  it("rejette la conversion d'un devis non accepté", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org invoice draft" } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Test" } });
    const user = await prisma.user.create({
      data: { email: `invoice-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    const quote = await createQuote(organization.id, { leadId: lead.id, lines: [{ label: "X", quantity: 1, unitPrice: 1000 }] });

    await expect(convertQuoteToInvoice(organization.id, quote.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("rejette une seconde conversion du même devis (une seule facture par devis)", async () => {
    const { organization, user, quote } = await createAcceptedQuote("double-convert");
    await convertQuoteToInvoice(organization.id, quote.id, user.id);

    await expect(convertQuoteToInvoice(organization.id, quote.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("liste et récupère une facture, isolées par organisation", async () => {
    const { organization, user, quote } = await createAcceptedQuote("list-get");
    const created = await convertQuoteToInvoice(organization.id, quote.id, user.id);

    const listed = await listInvoices(organization.id);
    expect(listed.map((i) => i.id)).toContain(created.id);

    const fetched = await getInvoice(organization.id, created.id);
    expect(fetched.id).toBe(created.id);

    const otherOrg = await prisma.organization.create({ data: { name: "Org invoice other" } });
    organizationIds.push(otherOrg.id);
    await expect(getInvoice(otherOrg.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it("fait progresser le statut d'une facture (DRAFT -> SENT -> PAID)", async () => {
    const { organization, user, quote } = await createAcceptedQuote("status");
    const invoice = await convertQuoteToInvoice(organization.id, quote.id, user.id);

    const sent = await updateInvoiceStatus(organization.id, invoice.id, InvoiceStatus.SENT);
    expect(sent.sentAt).not.toBeNull();

    const paid = await updateInvoiceStatus(organization.id, invoice.id, InvoiceStatus.PAID);
    expect(paid.paidAt).not.toBeNull();
  });

  it("génère un PDF valide pour une facture", async () => {
    const { organization, lead, user, quote } = await createAcceptedQuote("pdf");
    const invoice = await convertQuoteToInvoice(organization.id, quote.id, user.id);

    const fullInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } });
    const fullOrganization = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });

    const pdfBytes = await generateInvoicePdf({ organization: fullOrganization, invoice: fullInvoice, lines: fullInvoice.lines, lead });

    expect(pdfBytes.length).toBeGreaterThan(100);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8")).toBe("%PDF-");
  });
});
