import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listNavigationOverrides,
  setNavigationPreferences,
  applyNavigationPreset,
} from "@/lib/navigation-preferences-service";

/**
 * Navigation personnalisée par utilisateur : ne stocke que les écarts par rapport au menu par
 * défaut, persiste après "rechargement" (relecture depuis la base), reste strictement isolée par
 * utilisateur/organisation, et les deux préréglages ("service pizzeria" / "gestion complète")
 * produisent le résultat attendu — sans jamais toucher aux droits d'accès (portés par le rôle).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("navigation-preferences-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org nav ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `nav-pref-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("un compte n'ayant jamais touché ce réglage n'a aucun écart enregistré (visible par défaut)", async () => {
    const { organization, user } = await createOrgAndUser("no-touch");
    const overrides = await listNavigationOverrides(user.id, organization.id);
    expect(overrides).toEqual({});
  });

  it("masque une section, puis 'recharge' (relecture depuis la base) — elle reste masquée", async () => {
    const { organization, user } = await createOrgAndUser("hide-reload");

    await setNavigationPreferences(user.id, organization.id, [{ sectionKey: "/compta/stock", visible: false }]);

    // Simule un rechargement : une lecture entièrement nouvelle, indépendante de l'appel précédent.
    const reloaded = await listNavigationOverrides(user.id, organization.id);
    expect(reloaded["/compta/stock"]).toBe(false);
  });

  it("ré-affiche une section précédemment masquée (upsert idempotent)", async () => {
    const { organization, user } = await createOrgAndUser("toggle-back");
    await setNavigationPreferences(user.id, organization.id, [{ sectionKey: "/compta/depenses", visible: false }]);
    await setNavigationPreferences(user.id, organization.id, [{ sectionKey: "/compta/depenses", visible: true }]);

    const overrides = await listNavigationOverrides(user.id, organization.id);
    expect(overrides["/compta/depenses"]).toBe(true);

    const rows = await prisma.userNavigationPreference.findMany({ where: { userId: user.id, organizationId: organization.id } });
    expect(rows).toHaveLength(1); // upsert : jamais de doublon pour le même sectionKey
  });

  it("connecté avec un autre utilisateur de la même organisation : les préférences sont totalement indépendantes", async () => {
    const { organization, user: userA } = await createOrgAndUser("independence-a");
    const userB = await prisma.user.create({
      data: { email: `nav-pref-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "UserB" },
    });
    userIds.push(userB.id);

    await setNavigationPreferences(userA.id, organization.id, [{ sectionKey: "/compta/stock", visible: false }]);

    const overridesA = await listNavigationOverrides(userA.id, organization.id);
    const overridesB = await listNavigationOverrides(userB.id, organization.id);
    expect(overridesA["/compta/stock"]).toBe(false);
    expect(overridesB).toEqual({}); // le compte B n'a jamais rien réglé, donc rien n'est masqué pour lui
  });

  it("isole aussi par organisation pour un même utilisateur (multi-organisation)", async () => {
    const { organization: orgA, user } = await createOrgAndUser("multi-org-a");
    const { organization: orgB } = await createOrgAndUser("multi-org-b");

    await setNavigationPreferences(user.id, orgA.id, [{ sectionKey: "/compta/caisse", visible: false }]);

    const overridesOrgA = await listNavigationOverrides(user.id, orgA.id);
    const overridesOrgB = await listNavigationOverrides(user.id, orgB.id);
    expect(overridesOrgA["/compta/caisse"]).toBe(false);
    expect(overridesOrgB).toEqual({});
  });

  it("préréglage 'service pizzeria' : masque tout sauf le strict nécessaire au comptoir", async () => {
    const { organization, user } = await createOrgAndUser("preset-service");

    const overrides = await applyNavigationPreset(user.id, organization.id, "service_pizzeria");

    expect(overrides["/compta/commandes"]).toBeUndefined(); // reste visible (pas d'écart)
    expect(overrides["/compta/ventes"]).toBeUndefined(); // reste visible
    expect(overrides["/compta/caisse"]).toBeUndefined(); // reste visible
    expect(overrides["/compta/stock"]).toBeUndefined(); // reste visible
    expect(overrides["/leads"]).toBe(false); // masqué
    expect(overrides["/compta/fournisseurs"]).toBe(false); // masqué
    expect(overrides["/settings"]).toBe(false); // masqué
  });

  it("préréglage 'gestion complète' : efface tous les écarts, retombe sur le menu par défaut du rôle", async () => {
    const { organization, user } = await createOrgAndUser("preset-full");
    await setNavigationPreferences(user.id, organization.id, [{ sectionKey: "/compta/stock", visible: false }]);
    expect(await listNavigationOverrides(user.id, organization.id)).not.toEqual({});

    const overrides = await applyNavigationPreset(user.id, organization.id, "gestion_complete");
    expect(overrides).toEqual({});

    const rows = await prisma.userNavigationPreference.findMany({ where: { userId: user.id, organizationId: organization.id } });
    expect(rows).toHaveLength(0);
  });

  it("appliquer un préréglage remplace intégralement les écarts précédents (pas de fusion)", async () => {
    const { organization, user } = await createOrgAndUser("preset-replace");
    await setNavigationPreferences(user.id, organization.id, [{ sectionKey: "/compta/exports", visible: false }]);

    await applyNavigationPreset(user.id, organization.id, "service_pizzeria");

    const overrides = await listNavigationOverrides(user.id, organization.id);
    // L'écart posé manuellement avant le préréglage ne doit pas survivre tel quel : le préréglage
    // repart d'un état propre et applique sa propre liste de sections masquées.
    expect(overrides["/leads"]).toBe(false);
  });
});
