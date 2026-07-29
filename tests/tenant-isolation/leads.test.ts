import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { leadWhereForActor } from "@/lib/permissions";
import { MembershipRole } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL, voir
 * DATABASE_URL) : première application concrète du gabarit
 * `expectNoCrossTenantLeak` (voir tests/helpers/tenant-isolation.ts) au
 * domaine des prospects (`Lead`), qui existait déjà avant cette phase de
 * fondations techniques. Ignoré automatiquement si aucune base n'est
 * configurée (ex. `npm run test` sans PostgreSQL local).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Lead", () => {
  const createdOrganizationIds: string[] = [];

  async function createOrgWithLead(options: { role: MembershipRole; territoryId?: string | null }) {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org isolation ${suffix}` },
    });
    createdOrganizationIds.push(organization.id);

    const user = await prisma.user.create({
      data: {
        email: `isolation-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Test",
        lastName: "Actor",
      },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: options.role,
        territoryId: options.territoryId ?? null,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect isolation ${suffix}`,
        territoryId: options.territoryId ?? null,
      },
    });

    const actor: CurrentActor = {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      membership: { id: membership.id, role: membership.role, territoryId: membership.territoryId },
      organization: { id: organization.id, name: organization.name },
      sessionId: "test-session",
    };

    return { actor, lead };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  });

  it("un OWNER_ADMIN ne voit jamais les prospects d'une autre organisation", async () => {
    const { actor: actorA, lead: leadA } = await createOrgWithLead({ role: MembershipRole.OWNER_ADMIN });
    const { actor: actorB, lead: leadB } = await createOrgWithLead({ role: MembershipRole.OWNER_ADMIN });

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.lead.findMany({ where: leadWhereForActor(actorA) }),
      actorBItems: () => prisma.lead.findMany({ where: leadWhereForActor(actorB) }),
      actorAOwnResourceId: leadA.id,
      actorBOwnResourceId: leadB.id,
      getId: (lead) => lead.id,
    });
  });

  it("un PROVIDER ne voit que les prospects de son propre territoire", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org isolation territoire ${suffix}` },
    });
    createdOrganizationIds.push(organization.id);

    const territory = await prisma.territory.create({
      data: { organizationId: organization.id, name: `Territoire ${suffix}`, centerCity: "Avignon" },
    });

    const user = await prisma.user.create({
      data: {
        email: `isolation-provider-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Test",
        lastName: "Provider",
      },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: MembershipRole.PROVIDER,
        territoryId: territory.id,
      },
    });

    const providerActor: CurrentActor = {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      membership: { id: membership.id, role: membership.role, territoryId: membership.territoryId },
      organization: { id: organization.id, name: organization.name },
      sessionId: "test-session",
    };

    // Deux prospects de la même organisation : un dans le territoire du
    // prestataire, un hors de son territoire.
    const ownLead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect dans le territoire ${suffix}`,
        territoryId: territory.id,
      },
    });
    const otherLead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        establishmentName: `Prospect hors territoire ${suffix}`,
        territoryId: null,
      },
    });

    const visibleLeads = await prisma.lead.findMany({ where: leadWhereForActor(providerActor) });
    const visibleIds = visibleLeads.map((lead) => lead.id);

    expect(visibleIds).toContain(ownLead.id);
    expect(visibleIds).not.toContain(otherLead.id);
  });
});
