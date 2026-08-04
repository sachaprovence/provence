import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createVirtualTour, listVirtualTours, getVirtualTour, updateVirtualTour } from "@/lib/production/virtual-tour-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { VirtualTourStatus, PropertyType } from "@/generated/prisma/enums";

/**
 * Module "Visites 3D" (v0.9, ADR 0038) : `VirtualTour` lié à un `Mission`
 * existant (réutilise sa planification/son prestataire/son statut
 * d'exécution). `leadId` est TOUJOURS dérivé du `Mission` (via
 * `Mission.customer.leadId`), jamais accepté séparément — vérifie que
 * cette dérivation est correcte et que l'isolation multi-tenant est
 * respectée.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Production v0.9 — VirtualTour", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrgWithMission(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org visites ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: `Mission ${suffix}` } });
    return { organization, lead, customer, mission };
  }

  it("crée une visite 3D en dérivant leadId depuis la Mission (jamais fourni séparément)", async () => {
    const { organization, lead, mission } = await createOrgWithMission("create");

    const tour = await createVirtualTour(organization.id, {
      missionId: mission.id,
      type: PropertyType.VILLA,
      address: "Route de la Villa",
      surfaceM2: 180,
      matterportUrl: "https://my.matterport.com/show/?m=abc",
    });

    expect(tour.leadId).toBe(lead.id);
    expect(tour.type).toBe(PropertyType.VILLA);
    expect(tour.status).toBe(VirtualTourStatus.DRAFT);
  });

  it("rejette une mission d'une autre organisation", async () => {
    const { mission } = await createOrgWithMission("mission-other-a");
    const { organization: orgB } = await createOrgWithMission("mission-other-b");

    await expect(createVirtualTour(orgB.id, { missionId: mission.id })).rejects.toThrow(ValidationError);
  });

  it("rejette un bien immobilier appartenant à un autre client que celui de la mission", async () => {
    const { organization, mission } = await createOrgWithMission("property-mismatch");
    const otherLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Autre client" } });
    const otherProperty = await prisma.property.create({ data: { organizationId: organization.id, leadId: otherLead.id, label: "Bien d'un autre client" } });

    await expect(createVirtualTour(organization.id, { missionId: mission.id, propertyId: otherProperty.id })).rejects.toThrow(ValidationError);
  });

  it("accepte un bien immobilier du même client que la mission", async () => {
    const { organization, lead, mission } = await createOrgWithMission("property-match");
    const property = await prisma.property.create({ data: { organizationId: organization.id, leadId: lead.id, label: "Villa du client" } });

    const tour = await createVirtualTour(organization.id, { missionId: mission.id, propertyId: property.id });
    expect(tour.propertyId).toBe(property.id);
  });

  it("reprend automatiquement les coordonnées GPS de la Property liée quand elles ne sont pas fournies (v1.1, AR-0166)", async () => {
    const { organization, lead, mission } = await createOrgWithMission("gps-from-property");
    const property = await prisma.property.create({
      data: { organizationId: organization.id, leadId: lead.id, label: "Villa géolocalisée", latitude: 43.5, longitude: 5.4 },
    });

    const tour = await createVirtualTour(organization.id, { missionId: mission.id, propertyId: property.id });
    expect(tour.latitude).toBe(43.5);
    expect(tour.longitude).toBe(5.4);
  });

  it("des coordonnées GPS explicites priment sur celles de la Property liée", async () => {
    const { organization, lead, mission } = await createOrgWithMission("gps-explicit");
    const property = await prisma.property.create({
      data: { organizationId: organization.id, leadId: lead.id, label: "Villa géolocalisée", latitude: 43.5, longitude: 5.4 },
    });

    const tour = await createVirtualTour(organization.id, { missionId: mission.id, propertyId: property.id, latitude: 48.85, longitude: 2.35 });
    expect(tour.latitude).toBe(48.85);
    expect(tour.longitude).toBe(2.35);
  });

  it("n'a pas de coordonnées GPS quand aucune n'est fournie et qu'aucune Property n'est liée", async () => {
    const { organization, mission } = await createOrgWithMission("gps-none");
    const tour = await createVirtualTour(organization.id, { missionId: mission.id });
    expect(tour.latitude).toBeNull();
    expect(tour.longitude).toBeNull();
  });

  it("enregistre l'équipement utilisé et la durée prévue", async () => {
    const { organization, mission } = await createOrgWithMission("equipment");
    const tour = await createVirtualTour(organization.id, {
      missionId: mission.id,
      equipmentUsed: "Matterport Pro3, drone DJI Mini",
      scheduledDurationMinutes: 90,
    });
    expect(tour.equipmentUsed).toBe("Matterport Pro3, drone DJI Mini");
    expect(tour.scheduledDurationMinutes).toBe(90);

    const updated = await updateVirtualTour(organization.id, tour.id, { equipmentUsed: "Matterport Pro3 uniquement", scheduledDurationMinutes: 45 });
    expect(updated.equipmentUsed).toBe("Matterport Pro3 uniquement");
    expect(updated.scheduledDurationMinutes).toBe(45);
  });

  it("liste, récupère et met à jour le statut d'une visite, isolée par organisation", async () => {
    const { organization, mission } = await createOrgWithMission("list-update");
    const tour = await createVirtualTour(organization.id, { missionId: mission.id });

    const listed = await listVirtualTours(organization.id);
    expect(listed.map((t) => t.id)).toContain(tour.id);

    const fetched = await getVirtualTour(organization.id, tour.id);
    expect(fetched.mission.id).toBe(mission.id);

    const updated = await updateVirtualTour(organization.id, tour.id, { status: VirtualTourStatus.PUBLISHED, tourUrl: "https://tours.example.test/1" });
    expect(updated.status).toBe(VirtualTourStatus.PUBLISHED);
    expect(updated.tourUrl).toBe("https://tours.example.test/1");

    const otherOrg = await prisma.organization.create({ data: { name: "Org visites isolation" } });
    organizationIds.push(otherOrg.id);
    await expect(getVirtualTour(otherOrg.id, tour.id)).rejects.toThrow(NotFoundError);
  });
});
