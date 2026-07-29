import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { workspaceRoleToLegacyMembershipRole } from "@/lib/workspace-service";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Vérifie, sur les données de démonstration Provence 360 réellement seedées
 * (`npm run db:seed`), les invariants promis par la migration
 * `20260729221028_add_workspace_multi_tenant` (voir ADR 0005/0006) :
 * aucune donnée perdue, un workspace par défaut créé, chaque membership
 * historique reflété en WorkspaceMembership avec le bon rôle, et les
 * modules métier existants (CRM, devis, séquences, IA) toujours
 * accessibles. Ignoré si aucune base n'est configurée ou si le seed n'a
 * pas été exécuté.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("migration Provence 360 -> workspace par défaut", () => {
  it("l'organisation de démonstration possède un unique workspace par défaut", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@demo.provence360.fr" } });
    if (!admin) return; // seed non exécuté dans cet environnement de test.

    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id } });
    const organizationId = membership.organizationId;

    const workspaces = await prisma.workspace.findMany({ where: { organizationId } });
    expect(workspaces.length).toBeGreaterThanOrEqual(1);
    expect(workspaces.filter((w) => w.isDefault)).toHaveLength(1);
  });

  it("chaque membership existant a une WorkspaceMembership correspondante, avec le rôle attendu", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@demo.provence360.fr" } });
    if (!admin) return;

    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id } });
    const organizationId = membership.organizationId;

    const memberships = await prisma.membership.findMany({ where: { organizationId } });
    const defaultWorkspace = await prisma.workspace.findFirstOrThrow({ where: { organizationId, isDefault: true } });

    for (const m of memberships) {
      const workspaceMembership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: defaultWorkspace.id, userId: m.userId } },
      });
      expect(workspaceMembership, `WorkspaceMembership manquante pour userId=${m.userId}`).not.toBeNull();

      const expectedRole =
        m.role === MembershipRole.OWNER_ADMIN
          ? WorkspaceRole.OWNER
          : m.role === MembershipRole.PROVIDER
            ? WorkspaceRole.OPERATOR
            : WorkspaceRole.COMMERCIAL;
      expect(workspaceMembership?.role).toBe(expectedRole);
    }
  });

  it("le mapping de rôle historique -> workspace est cohérent dans les deux sens de conversion utilisés par l'application", () => {
    expect(workspaceRoleToLegacyMembershipRole(WorkspaceRole.OWNER)).toBe(MembershipRole.OWNER_ADMIN);
    expect(workspaceRoleToLegacyMembershipRole(WorkspaceRole.ADMIN)).toBe(MembershipRole.OWNER_ADMIN);
    expect(workspaceRoleToLegacyMembershipRole(WorkspaceRole.OPERATOR)).toBe(MembershipRole.PROVIDER);
    expect(workspaceRoleToLegacyMembershipRole(WorkspaceRole.COMMERCIAL)).toBe(MembershipRole.SALES);
  });

  it("tous les prospects existants sont rattachés au workspace par défaut de leur organisation (aucune perte de donnée)", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@demo.provence360.fr" } });
    if (!admin) return;

    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id } });
    const organizationId = membership.organizationId;
    const defaultWorkspace = await prisma.workspace.findFirstOrThrow({ where: { organizationId, isDefault: true } });

    const [totalLeads, leadsWithoutWorkspace, leadsOutsideDefaultWorkspace] = await Promise.all([
      prisma.lead.count({ where: { organizationId } }),
      prisma.lead.count({ where: { organizationId, workspaceId: null } }),
      prisma.lead.count({ where: { organizationId, NOT: { workspaceId: defaultWorkspace.id } } }),
    ]);

    expect(totalLeads).toBeGreaterThan(0);
    expect(leadsWithoutWorkspace).toBe(0);
    expect(leadsOutsideDefaultWorkspace).toBe(0);
  });

  it("les modules métier existants (CRM, devis, séquences, IA) restent accessibles après migration", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@demo.provence360.fr" } });
    if (!admin) return;

    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id } });
    const organizationId = membership.organizationId;

    const [leads, quotes, sequences, campaigns, analyses] = await Promise.all([
      prisma.lead.count({ where: { organizationId } }),
      prisma.quote.count({ where: { organizationId } }),
      prisma.sequence.count({ where: { organizationId } }),
      prisma.campaign.count({ where: { organizationId } }),
      prisma.leadAnalysis.count({ where: { lead: { organizationId } } }),
    ]);

    expect(leads).toBeGreaterThan(0);
    expect(quotes).toBeGreaterThan(0);
    expect(sequences).toBeGreaterThan(0);
    expect(campaigns).toBeGreaterThan(0);
    expect(analyses).toBeGreaterThan(0);
  });
});
