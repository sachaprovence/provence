import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyPlanToOrganization, assertMemberLimitAvailable, countOrganizationMembers, getPlanByKey, listPlans } from "@/lib/billing/plan-service";
import { ConflictError } from "@/lib/errors";
import { MembershipRole, PlanKey } from "@/generated/prisma/enums";

/**
 * Plans d'abonnement SaaS (v1.0, AR-0062) — vérifie : (1) les 3 plans de
 * référence (Starter/Pro/Entreprise) sont bien seedés par la migration de
 * données (pas `db:seed`, une donnée de référence doit exister dans TOUT
 * environnement) ; (2) appliquer un plan copie ses quotas sur
 * l'organisation (réutilise `dailySendLimit`/`aiMonthlyBudgetUsd` déjà
 * existants, jamais une deuxième source de vérité) ; (3) la limite
 * d'utilisateurs du plan est réellement bloquante ; (4) une organisation
 * sans plan n'est jamais bloquée (comportement additif).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("listPlans / getPlanByKey", () => {
  it("les 4 plans de référence existent (seedés par migration, pas par db:seed — TRIAL ajouté en v1.4)", async () => {
    const plans = await listPlans();
    const keys = plans.map((p) => p.key).sort();
    expect(keys).toEqual([PlanKey.ENTERPRISE, PlanKey.PRO, PlanKey.STARTER, PlanKey.TRIAL].sort());
  });

  it("getPlanByKey renvoie le plan Starter avec ses quotas attendus", async () => {
    const plan = await getPlanByKey(PlanKey.STARTER);
    expect(plan.maxUsers).toBeGreaterThan(0);
    expect(plan.dailySendLimit).toBeGreaterThan(0);
  });

});

runIfDatabase("applyPlanToOrganization / assertMemberLimitAvailable", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org plan ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("applyPlanToOrganization copie les quotas du plan sur l'organisation", async () => {
    const organization = await createOrg("apply");
    const starter = await getPlanByKey(PlanKey.STARTER);

    const updated = await applyPlanToOrganization(organization.id, PlanKey.STARTER);

    expect(updated.planId).toBe(starter.id);
    expect(updated.dailySendLimit).toBe(starter.dailySendLimit);
    expect(updated.aiMonthlyBudgetUsd).toBe(starter.aiMonthlyBudgetUsd);
  });

  it("changer de plan met à jour les quotas en conséquence", async () => {
    const organization = await createOrg("change");
    await applyPlanToOrganization(organization.id, PlanKey.STARTER);

    const pro = await getPlanByKey(PlanKey.PRO);
    const updated = await applyPlanToOrganization(organization.id, PlanKey.PRO);

    expect(updated.planId).toBe(pro.id);
    expect(updated.dailySendLimit).toBe(pro.dailySendLimit);
  });

  it("une organisation sans plan n'est jamais bloquée pour l'ajout d'un membre", async () => {
    const organization = await createOrg("no-plan");
    await expect(assertMemberLimitAvailable(organization.id)).resolves.toBeUndefined();
  });

  it("bloque explicitement l'ajout d'un membre une fois la limite du plan atteinte", async () => {
    const organization = await createOrg("limit");
    const starter = await getPlanByKey(PlanKey.STARTER);
    await applyPlanToOrganization(organization.id, PlanKey.STARTER);

    // Remplit l'organisation exactement jusqu'à `maxUsers` (sans jamais modifier
    // le plan de référence partagé, réutilisé par tous les tests en parallèle).
    for (let i = 0; i < starter.maxUsers; i++) {
      const user = await prisma.user.create({
        data: { email: `plan-limit-${organization.id}-${i}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "Limit" },
      });
      await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN } });
    }

    await expect(assertMemberLimitAvailable(organization.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("countOrganizationMembers compte correctement les membres", async () => {
    const organization = await createOrg("count");
    const user1 = await prisma.user.create({
      data: { email: `count-1-${organization.id}@example.test`, passwordHash: "not-a-real-hash", firstName: "A", lastName: "B" },
    });
    const user2 = await prisma.user.create({
      data: { email: `count-2-${organization.id}@example.test`, passwordHash: "not-a-real-hash", firstName: "C", lastName: "D" },
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: organization.id, userId: user1.id, role: MembershipRole.OWNER_ADMIN },
        { organizationId: organization.id, userId: user2.id, role: MembershipRole.SALES },
      ],
    });

    expect(await countOrganizationMembers(organization.id)).toBe(2);
  });
});
