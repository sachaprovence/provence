import { prisma } from "@/lib/prisma";
import { DEFAULT_AUTOMATION_RULES } from "@/lib/automation-engine";
import { ServiceKind } from "@/generated/prisma/enums";
import { buildDefaultPipelineStages } from "@/lib/crm/pipeline-service";

export const LAUNCH_ZONES = ["Avignon", "Monteux", "Carpentras", "Orange", "Cavaillon", "Aix-en-Provence", "Marseille"];

export const DEFAULT_SERVICES: { kind: ServiceKind; name: string; description: string; basePrice: number }[] = [
  { kind: ServiceKind.VIRTUAL_TOUR_SIMPLE, name: "Visite virtuelle simple", description: "Visite 360° d'un établissement, hébergement standard.", basePrice: 25000 },
  { kind: ServiceKind.VIRTUAL_TOUR_PREMIUM, name: "Visite virtuelle premium", description: "Visite 360° haut de gamme avec habillage et points d'intérêt.", basePrice: 45000 },
  { kind: ServiceKind.PHOTO_PACK_AND_TOUR, name: "Pack photos et visite virtuelle", description: "Séance photo professionnelle incluse.", basePrice: 55000 },
  { kind: ServiceKind.MULTI_UNIT_OFFER, name: "Offre multi-logements", description: "Tarif dégressif pour plusieurs logements/établissements.", basePrice: 90000 },
  { kind: ServiceKind.UPDATE_SUBSCRIPTION, name: "Abonnement de mise à jour", description: "Mise à jour annuelle des visites et photos.", basePrice: 30000 },
  { kind: ServiceKind.OUT_OF_ZONE_TRAVEL, name: "Déplacement hors zone", description: "Frais de déplacement en dehors de la zone standard.", basePrice: 8000 },
  { kind: ServiceKind.CUSTOM, name: "Offre personnalisée", description: "Prestation sur mesure.", basePrice: 0 },
];

/** Configure une organisation nouvellement créée avec des données de base utilisables immédiatement. */
export async function bootstrapOrganization(organizationId: string) {
  await prisma.$transaction([
    prisma.emailAccount.create({
      data: {
        organizationId,
        providerKind: "DEMO",
        fromName: "Provence 360",
        fromEmail: "contact@demo.provence360.local",
        dailyLimit: 50,
      },
    }),
    prisma.automationRule.createMany({
      data: DEFAULT_AUTOMATION_RULES.map((r) => ({
        organizationId,
        name: r.name,
        triggerType: r.triggerType,
        actionType: r.actionType,
        triggerConfig: {},
        actionConfig: {},
        isActive: true,
      })),
    }),
    prisma.service.createMany({
      data: DEFAULT_SERVICES.map((s) => ({ organizationId, ...s })),
    }),
    prisma.territory.createMany({
      data: LAUNCH_ZONES.map((zone) => ({ organizationId, name: zone, centerCity: zone, radiusKm: 40 })),
    }),
    prisma.integration.createMany({
      data: [
        { organizationId, kind: "EMAIL", name: "Fournisseur email démo", status: "DEMO" },
        { organizationId, kind: "AI", name: "Fournisseur IA démo", status: "DEMO" },
        // Communication Hub (v0.9, ADR 0038) — canaux additionnels. SMS/WhatsApp/Téléphone
        // nécessitent un vrai fournisseur externe (identifiants absents ici) : mode démo.
        // Webhooks sortants sont réellement fonctionnels (simple POST HTTP) mais nécessitent
        // une URL cible non configurée par défaut : DISCONNECTED, pas DEMO.
        { organizationId, kind: "SMS", name: "SMS", status: "DEMO" },
        { organizationId, kind: "WHATSAPP", name: "WhatsApp", status: "DEMO" },
        { organizationId, kind: "PHONE", name: "Téléphone", status: "DEMO" },
        { organizationId, kind: "WEBHOOK", name: "Webhooks sortants", status: "DISCONNECTED" },
      ],
    }),
    prisma.pipelineStage.createMany({ data: buildDefaultPipelineStages(organizationId) }),
  ]);
}
