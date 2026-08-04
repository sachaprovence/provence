import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSessionOrganizationRestricted } from "@/lib/security/subscription-gate";
import { proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { SubscriptionStatus, MembershipRole } from "@/generated/prisma/enums";

/**
 * Blocage d'écriture pour organisation restreinte (v1.0, AR-0063) — après
 * un échec de paiement d'abonnement, l'organisation bascule en
 * `RESTRICTED` : les requêtes mutantes doivent échouer explicitement
 * (402), la lecture et la régularisation de facturation restent toujours
 * possibles (jamais de perte de données, voir MILESTONES.md §v1.0).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isSessionOrganizationRestricted / proxy — blocage d'écriture", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createSessionForOrg(suffix: string, subscriptionStatus: SubscriptionStatus) {
    const organization = await prisma.organization.create({ data: { name: `Org restriction ${suffix}`, subscriptionStatus } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `restriction-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "Restriction" },
    });
    userIds.push(user.id);
    await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN } });
    const session = await prisma.session.create({
      data: { userId: user.id, token: `test-token-${suffix}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    return { organization, user, session };
  }

  it("isSessionOrganizationRestricted renvoie true pour une organisation RESTRICTED, false sinon", async () => {
    const restricted = await createSessionForOrg("gate-true", SubscriptionStatus.RESTRICTED);
    const active = await createSessionForOrg("gate-false", SubscriptionStatus.ACTIVE);

    expect(await isSessionOrganizationRestricted(restricted.session.token)).toBe(true);
    expect(await isSessionOrganizationRestricted(active.session.token)).toBe(false);
  });

  it("proxy() bloque une requête mutante (402) pour une organisation restreinte", async () => {
    const { session } = await createSessionForOrg("proxy-blocked", SubscriptionStatus.RESTRICTED);
    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(402);
  });

  it("proxy() laisse passer une requête mutante pour une organisation active", async () => {
    const { session } = await createSessionForOrg("proxy-allowed", SubscriptionStatus.ACTIVE);
    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    });

    const response = await proxy(request);
    expect(response.status).not.toBe(402);
  });

  it("proxy() n'applique jamais le blocage à une requête de lecture (GET)", async () => {
    const { session } = await createSessionForOrg("proxy-read", SubscriptionStatus.RESTRICTED);
    const request = new NextRequest("http://localhost/api/leads", {
      method: "GET",
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    });

    const response = await proxy(request);
    expect(response.status).not.toBe(402);
  });

  it("proxy() n'applique jamais le blocage aux routes de facturation, même restreinte (régularisation toujours possible)", async () => {
    const { session } = await createSessionForOrg("proxy-billing-exempt", SubscriptionStatus.RESTRICTED);
    const request = new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${session.token}` },
    });

    const response = await proxy(request);
    expect(response.status).not.toBe(402);
  });
});
