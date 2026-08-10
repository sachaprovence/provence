import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale } from "@/lib/compta/sale-service";
import {
  openCashSession,
  closeCashSession,
  getOpenSession,
  getCashSession,
  listCashSessions,
  getSessionPaymentBreakdown,
} from "@/lib/compta/cash-session-service";
import { NotFoundError, ConflictError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — cash-session-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta cash session ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-cash-session-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("ouvre une session avec un fond de caisse, rejette une seconde ouverture simultanée", async () => {
    const { organization, user } = await createOrgAndUser("open-guard");
    const session = await openCashSession(organization.id, { openingFloat: 5000 }, user.id);
    expect(session.closedAt).toBeNull();

    await expect(openCashSession(organization.id, { openingFloat: 3000 }, user.id)).rejects.toThrow(ConflictError);

    const open = await getOpenSession(organization.id);
    expect(open?.id).toBe(session.id);
  });

  it("répartit le CA par mode de paiement sur la fenêtre de la session", async () => {
    const { organization, user } = await createOrgAndUser("breakdown");
    const session = await openCashSession(organization.id, { openingFloat: 10000 }, user.id);

    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 950, vatRate: 10 }] }, user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CARD", discountPercent: 0, lines: [{ productName: "Y", quantity: 1, unitPrice: 1200, vatRate: 10 }] }, user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "MEAL_VOUCHER", discountPercent: 0, lines: [{ productName: "Z", quantity: 1, unitPrice: 1000, vatRate: 10 }] }, user.id);

    const breakdown = await getSessionPaymentBreakdown(organization.id, session.id);
    expect(breakdown.CASH).toBe(950);
    expect(breakdown.CARD).toBe(1200);
    expect(breakdown.MEAL_VOUCHER).toBe(1000);
    expect(breakdown.CHEQUE).toBe(0);
  });

  it("ferme une session : théorique = fond de caisse + ventes espèces, écart vs comptage réel", async () => {
    const { organization, user } = await createOrgAndUser("close");
    const session = await openCashSession(organization.id, { openingFloat: 10000 }, user.id); // 100,00€

    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 2000, vatRate: 10 }] }, user.id); // +20€ espèces
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CARD", discountPercent: 0, lines: [{ productName: "Y", quantity: 1, unitPrice: 5000, vatRate: 10 }] }, user.id); // CB, ignoré du théorique espèces

    // Théorique attendu : 100 + 20 = 120€. Compté réel : 118€ (écart -2€).
    const closed = await closeCashSession(
      organization.id,
      session.id,
      { denominations: { bills: { "100": 1 }, coins: { "2": 9 } } }, // 100 + 18 = 118€
      user.id
    );

    expect(closed.theoreticalAmount).toBe(12000);
    expect(closed.closingCountedAmount).toBe(11800);
    expect(closed.differenceAmount).toBe(-200);
    expect(closed.closedAt).not.toBeNull();

    const stillOpen = await getOpenSession(organization.id);
    expect(stillOpen).toBeNull();
  });

  it("rejette la fermeture d'une session déjà fermée", async () => {
    const { organization, user } = await createOrgAndUser("close-guard");
    const session = await openCashSession(organization.id, { openingFloat: 0 }, user.id);
    await closeCashSession(organization.id, session.id, { denominations: null }, user.id);

    await expect(closeCashSession(organization.id, session.id, { denominations: null }, user.id)).rejects.toThrow(ConflictError);
  });

  it("liste et récupère une session, isolée par organisation", async () => {
    const { organization, user } = await createOrgAndUser("list-get");
    const session = await openCashSession(organization.id, { openingFloat: 0 }, user.id);

    const listed = await listCashSessions(organization.id);
    expect(listed.map((s) => s.id)).toContain(session.id);

    const { organization: otherOrg } = await createOrgAndUser("list-get-other");
    await expect(getCashSession(otherOrg.id, session.id)).rejects.toThrow(NotFoundError);
  });

  it("une nouvelle session peut être ouverte après la fermeture de la précédente", async () => {
    const { organization, user } = await createOrgAndUser("reopen");
    const first = await openCashSession(organization.id, { openingFloat: 0 }, user.id);
    await closeCashSession(organization.id, first.id, { denominations: null }, user.id);

    const second = await openCashSession(organization.id, { openingFloat: 2000 }, user.id);
    expect(second.id).not.toBe(first.id);
  });
});
