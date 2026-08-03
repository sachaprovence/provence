import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { bootstrapOrganization, LAUNCH_ZONES } from "../src/lib/bootstrap";
import { computeScore } from "../src/lib/scoring";
import { onLeadScoreComputed, onPositiveReply, onDealWon } from "../src/lib/automation-engine";
import { enrollLeadInSequence, processDueSequences, sendMessageNow, stopEnrollmentsForLead } from "../src/lib/sequence-engine";
import { addSuppression } from "../src/lib/suppression";
import { DemoAIProvider } from "../src/lib/ai/demo-provider";
import { MembershipRole, WorkspaceRole, EnrollmentStopReason, SuppressionReason, ReplyIntent, LeadSourceType } from "../src/generated/prisma/enums";

const DEMO_ADMIN_EMAIL = "admin@demo.provence360.fr";
const DEMO_SALES_EMAIL = "commercial@demo.provence360.fr";
const DEMO_PROVIDER_EMAIL = "prestataire@demo.provence360.fr";
const DEMO_PASSWORD = "demo12345";

const ai = new DemoAIProvider();

type LeadSeed = {
  establishmentName: string;
  category: "AIRBNB_HOST" | "VILLA" | "HOTEL" | "CAMPING" | "REAL_ESTATE_AGENCY" | "RESTAURANT" | "EVENT_VENUE" | "RETAIL";
  city: string;
  websiteUrl?: string;
  hasVirtualTour?: boolean;
  reviewCount?: number;
  averageRating?: number;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  socialLinks?: Record<string, string>;
};

const LEADS: LeadSeed[] = [
  { establishmentName: "Villa Les Lavandes", category: "VILLA", city: "Gordes", websiteUrl: "https://villalavandes.example", hasVirtualTour: false, reviewCount: 62, averageRating: 4.8, contactName: "Marie Dupont", contactEmail: "marie@villalavandes.example", contactPhone: "+33612345601", socialLinks: { instagram: "https://instagram.com/villalavandes" } },
  { establishmentName: "Mas du Soleil Provençal", category: "AIRBNB_HOST", city: "Avignon", hasVirtualTour: false, reviewCount: 84, averageRating: 4.9, contactName: "Julien Martin", contactEmail: "julien@massoleil.example", contactPhone: "+33612345602" },
  { establishmentName: "Hôtel des Papes", category: "HOTEL", city: "Avignon", websiteUrl: "https://hoteldespapes.example", hasVirtualTour: false, reviewCount: 210, averageRating: 4.3, contactName: "Sophie Bernard", contactEmail: "sophie@hoteldespapes.example" },
  { establishmentName: "Camping Les Oliviers", category: "CAMPING", city: "Carpentras", hasVirtualTour: false, reviewCount: 45, averageRating: 4.1, contactName: "Marc Petit", contactEmail: "marc@lesoliviers.example", contactPhone: "+33612345604" },
  { establishmentName: "Agence Immo Provence", category: "REAL_ESTATE_AGENCY", city: "Orange", websiteUrl: "https://immoprovence.example", hasVirtualTour: true, reviewCount: 30, averageRating: 4.0, contactName: "Claire Rousseau", contactEmail: "claire@immoprovence.example" },
  { establishmentName: "Restaurant La Table du Comtat", category: "RESTAURANT", city: "Carpentras", hasVirtualTour: false, reviewCount: 95, averageRating: 4.6, contactName: "Antoine Leroy", contactEmail: "antoine@tableducomtat.example", socialLinks: { instagram: "https://instagram.com/tableducomtat" } },
  { establishmentName: "Domaine de la Bastide", category: "EVENT_VENUE", city: "Aix-en-Provence", websiteUrl: "https://domainebastide.example", hasVirtualTour: false, reviewCount: 58, averageRating: 4.7, contactName: "Isabelle Moreau", contactEmail: "isabelle@domainebastide.example" },
  { establishmentName: "Boutique Lavande & Sens", category: "RETAIL", city: "Cavaillon", hasVirtualTour: false, reviewCount: 22, averageRating: 4.4, contactName: "Nicolas Girard", contactEmail: "nicolas@lavandesens.example" },
  { establishmentName: "Villa Panorama Marseille", category: "VILLA", city: "Marseille", hasVirtualTour: false, reviewCount: 71, averageRating: 4.9, contactName: "Camille Fontaine", contactEmail: "camille@villapanorama.example", contactPhone: "+33612345609" },
  { establishmentName: "Le Gîte du Ventoux", category: "AIRBNB_HOST", city: "Monteux", hasVirtualTour: false, reviewCount: 38, averageRating: 4.7, contactName: "Thomas Blanc", contactEmail: "thomas@gitedu.example" },
  { establishmentName: "Hôtel Aix Centre", category: "HOTEL", city: "Aix-en-Provence", websiteUrl: "https://hotelaixcentre.example", hasVirtualTour: true, reviewCount: 150, averageRating: 4.0, contactName: "Laura Simon", contactEmail: "laura@hotelaixcentre.example" },
  { establishmentName: "Camping Marseillevoyre", category: "CAMPING", city: "Marseille", hasVirtualTour: false, reviewCount: 12, averageRating: 3.6, contactName: "David Roux", contactEmail: "david@campingmarseille.example" },
  { establishmentName: "Villa Cavaillon Prestige", category: "VILLA", city: "Cavaillon", hasVirtualTour: false, reviewCount: 55, averageRating: 4.85, contactName: "Emma Faure", contactEmail: "emma@cavaillonprestige.example", contactPhone: "+33612345613" },
  { establishmentName: "Restaurant Le Petit Orange", category: "RESTAURANT", city: "Orange", hasVirtualTour: false, reviewCount: 40, averageRating: 4.2, contactName: "Hugo Michel", contactEmail: "hugo@petitorange.example" },
  { establishmentName: "Agence Sud Immobilier", category: "REAL_ESTATE_AGENCY", city: "Marseille", websiteUrl: "https://sudimmobilier.example", hasVirtualTour: false, reviewCount: 18, averageRating: 3.9, contactName: "Chloé Lambert", contactEmail: "chloe@sudimmobilier.example" },
  { establishmentName: "Le Clos des Micocouliers (fermé)", category: "EVENT_VENUE", city: "Avignon", hasVirtualTour: false, reviewCount: 5, averageRating: 3.2, contactName: "Paul Garnier", contactEmail: "paul@closmicocouliers.example" },
];

async function main() {
  const existingAdmin = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
  if (existingAdmin) {
    console.log("Données de démonstration déjà présentes — arrêt (rien à faire).");
    return;
  }

  console.log("Création de l'organisation de démonstration…");
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const { organization, adminUser, workspace } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: "Provence 360 (Démo)",
        description: "Visites virtuelles 3D et 360° pour hébergements et commerces de Provence.",
        website: "https://provence360.example",
        pitch: "Nous réalisons des visites virtuelles 360° et des contenus immersifs pour valoriser votre établissement sur Airbnb, Booking et votre propre site.",
        services: ["Visites virtuelles 3D et 360°", "Contenus immersifs Airbnb / Booking", "Photos professionnelles", "Mise en valeur numérique"],
        zones: LAUNCH_ZONES,
        emailSignature: "L'équipe Provence 360",
        portfolioLinks: ["https://provence360.example/realisations/villa-luberon", "https://provence360.example/realisations/hotel-avignon"],
      },
    });
    const adminUser = await tx.user.create({
      data: { email: DEMO_ADMIN_EMAIL, passwordHash, firstName: "Alex", lastName: "Admin" },
    });
    await tx.membership.create({ data: { organizationId: organization.id, userId: adminUser.id, role: MembershipRole.OWNER_ADMIN } });

    // Toute organisation reçoit un workspace par défaut (voir ADR 0005) —
    // même logique que POST /api/auth/register, nécessaire pour que
    // requireWorkspaceActor() résolve un contexte valide à la connexion.
    const workspace = await tx.workspace.create({
      data: { organizationId: organization.id, name: organization.name, slug: "principal", isDefault: true },
    });
    await tx.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: WorkspaceRole.OWNER, invitedById: adminUser.id },
    });

    return { organization, adminUser, workspace };
  });

  await bootstrapOrganization(organization.id);

  const salesUser = await prisma.user.create({ data: { email: DEMO_SALES_EMAIL, passwordHash, firstName: "Sarah", lastName: "Commerciale" } });
  await prisma.membership.create({ data: { organizationId: organization.id, userId: salesUser.id, role: MembershipRole.SALES } });
  await prisma.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: salesUser.id, role: WorkspaceRole.COMMERCIAL, invitedById: adminUser.id },
  });

  const avignonTerritory = await prisma.territory.findFirstOrThrow({ where: { organizationId: organization.id, name: "Avignon" } });
  const providerUser = await prisma.user.create({ data: { email: DEMO_PROVIDER_EMAIL, passwordHash, firstName: "Paul", lastName: "Prestataire" } });
  await prisma.membership.create({ data: { organizationId: organization.id, userId: providerUser.id, role: MembershipRole.PROVIDER, territoryId: avignonTerritory.id } });
  await prisma.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: providerUser.id, role: WorkspaceRole.OPERATOR, invitedById: adminUser.id },
  });
  await prisma.provider.create({ data: { organizationId: organization.id, territoryId: avignonTerritory.id, name: "Paul Prestataire", email: DEMO_PROVIDER_EMAIL, specialties: ["photo", "visite virtuelle"] } });

  console.log("Création des profils de client idéal (ICP)…");
  await prisma.idealCustomerProfile.createMany({
    data: [
      { organizationId: organization.id, name: "Propriétaire Airbnb multi-logements", category: "AIRBNB_HOST", zones: LAUNCH_ZONES, hasVirtualTourExpected: false, priority: 5, minReviewCount: 20, positiveKeywords: ["superhost", "plusieurs logements"], exclusionCriteria: ["logement unique occasionnel"] },
      { organizationId: organization.id, name: "Villa haut de gamme", category: "VILLA", zones: ["Gordes", "Aix-en-Provence", "Cavaillon"], hasVirtualTourExpected: false, priority: 5, minRating: 4.5, positiveKeywords: ["piscine", "vue", "prestige"] },
      { organizationId: organization.id, name: "Hôtel indépendant", category: "HOTEL", zones: LAUNCH_ZONES, hasVirtualTourExpected: false, priority: 4, minReviewCount: 50 },
      { organizationId: organization.id, name: "Camping familial", category: "CAMPING", zones: LAUNCH_ZONES, hasVirtualTourExpected: false, priority: 3 },
    ],
  });
  const villaIcp = await prisma.idealCustomerProfile.findFirstOrThrow({ where: { organizationId: organization.id, category: "VILLA" } });

  console.log("Création des prospects et de leur analyse…");
  const demoSource = await prisma.leadSource.create({
    data: { organizationId: organization.id, type: LeadSourceType.MANUAL, label: "Données de démonstration" },
  });
  const createdLeads: { id: string; category: string; hasEmail: boolean }[] = [];
  for (const seed of LEADS) {
    const territory = await prisma.territory.findFirst({ where: { organizationId: organization.id, name: seed.city } });
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        establishmentName: seed.establishmentName,
        category: seed.category,
        city: seed.city,
        region: "Provence",
        country: "France",
        territoryId: territory?.id,
        websiteUrl: seed.websiteUrl,
        hasVirtualTour: seed.hasVirtualTour,
        reviewCount: seed.reviewCount,
        averageRating: seed.averageRating,
        socialLinks: seed.socialLinks,
        closedBusiness: seed.establishmentName.includes("fermé"),
        icpId: seed.category === "VILLA" ? villaIcp.id : undefined,
        sourceId: demoSource.id,
        contacts: { create: [{ fullName: seed.contactName, email: seed.contactEmail, phone: seed.contactPhone, isPrimary: true }] },
      },
    });

    const analysis = await ai.analyzeLead({
      establishmentName: lead.establishmentName,
      category: lead.category,
      city: lead.city,
      hasVirtualTour: lead.hasVirtualTour,
      reviewCount: lead.reviewCount,
      averageRating: lead.averageRating,
      websiteUrl: lead.websiteUrl,
      socialLinks: seed.socialLinks ?? null,
      closedBusiness: lead.closedBusiness,
      contactName: seed.contactName,
    });
    await prisma.leadAnalysis.create({
      data: {
        leadId: lead.id,
        summary: analysis.summary,
        clienteleType: analysis.clienteleType,
        digitalPresenceQuality: analysis.digitalPresenceQuality,
        hasVirtualTourAssessment: analysis.hasVirtualTourAssessment,
        opportunities: analysis.opportunities,
        recommendedAngle: analysis.recommendedAngle,
        recommendedService: analysis.recommendedService,
        priorityLevel: analysis.priorityLevel,
        personalizedArguments: analysis.personalizedArguments,
        negativeSignals: analysis.negativeSignals,
        verifiedFacts: analysis.verifiedFacts,
        estimatedFacts: analysis.estimatedFacts,
        missingInfo: analysis.missingInfo,
      },
    });

    const score = computeScore({
      establishmentName: lead.establishmentName,
      category: lead.category,
      hasVirtualTour: lead.hasVirtualTour,
      reviewCount: lead.reviewCount,
      averageRating: lead.averageRating,
      websiteUrl: lead.websiteUrl,
      socialLinks: seed.socialLinks ?? null,
      address: null,
      inZone: true,
      recentlyContactedDays: null,
      isSuppressed: false,
      closedBusiness: lead.closedBusiness,
    });
    await prisma.leadScore.create({ data: { leadId: lead.id, value: score.value, category: score.category, breakdown: score.breakdown } });
    await onLeadScoreComputed(lead.id, organization.id, score.value);
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "QUALIFIED" } });

    createdLeads.push({ id: lead.id, category: lead.category, hasEmail: true });
  }

  console.log("Création de la séquence et de la campagne de démonstration…");
  const sequence = await prisma.sequence.create({
    data: {
      organizationId: organization.id,
      name: "Séquence standard — premier contact",
      description: "Email de premier contact puis 3 relances espacées.",
      steps: {
        // Fenêtre horaire volontairement large (0-24h, 7j/7) pour que les données de
        // démonstration se peuplent immédiatement quel que soit le moment où le seed
        // est exécuté. Modifiable ensuite dans l'interface (Séquences).
        create: [
          { order: 1, delayDays: 0, channel: "EMAIL", templateKey: "FIRST_CONTACT_EMAIL", requiresValidation: true, allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] },
          { order: 2, delayDays: 3, channel: "EMAIL", templateKey: "FOLLOW_UP_SHORT", requiresValidation: true, allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] },
          { order: 3, delayDays: 7, channel: "EMAIL", templateKey: "FOLLOW_UP_CASE_STUDY", requiresValidation: true, allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] },
          { order: 4, delayDays: 14, channel: "EMAIL", templateKey: "FOLLOW_UP_SHORT", requiresValidation: true, allowedStartHour: 0, allowedEndHour: 24, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6] },
        ],
      },
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: organization.id,
      name: "Campagne de lancement — Provence",
      description: "Première vague de prospection sur la zone de lancement.",
      status: "ACTIVE",
      sequenceId: sequence.id,
    },
  });

  const enrollTargets = createdLeads.slice(0, 8);
  for (const target of enrollTargets) {
    await prisma.lead.update({ where: { id: target.id }, data: { campaignId: campaign.id } });
    await enrollLeadInSequence({ leadId: target.id, sequenceId: sequence.id, campaignId: campaign.id });
  }

  console.log("Simulation de l'envoi des premiers messages…");
  await processDueSequences();

  const pendingMessages = await prisma.message.findMany({
    where: { lead: { organizationId: organization.id }, status: "PENDING_VALIDATION" },
    take: 5,
  });
  for (const message of pendingMessages) {
    await prisma.message.update({ where: { id: message.id }, data: { status: "APPROVED", validatedById: adminUser.id, validatedAt: new Date() } });
    await sendMessageNow(message.id);
  }

  console.log("Simulation de réponses entrantes…");
  const sentMessages = await prisma.message.findMany({
    where: { lead: { organizationId: organization.id }, status: "SENT" },
    include: { lead: { include: { contacts: true } } },
    take: 3,
  });

  const replyScripts = [
    "Bonjour, oui je suis très intéressé, pouvons-nous prendre rendez-vous cette semaine ?",
    "Bonjour, pourriez-vous m'indiquer vos tarifs pour une visite virtuelle premium ?",
    "Merci mais nous ne sommes pas intéressés pour le moment.",
  ];

  let interestedLeadId: string | null = null;
  for (let i = 0; i < sentMessages.length; i++) {
    const message = sentMessages[i];
    const body = replyScripts[i % replyScripts.length];
    const classification = await ai.classifyReply({ body });
    await prisma.conversation.create({
      data: {
        leadId: message.leadId,
        direction: "inbound",
        fromAddress: message.lead.contacts.find((c) => c.email)?.email,
        body,
        intent: classification.intent,
      },
    });
    if (classification.intent !== ReplyIntent.AUTO_REPLY) {
      await stopEnrollmentsForLead(message.leadId, EnrollmentStopReason.REPLIED);
    }
    if (classification.intent === ReplyIntent.INTERESTED) {
      await prisma.lead.update({ where: { id: message.leadId }, data: { stage: "INTERESTED" } });
      await onPositiveReply(message.leadId, organization.id);
      interestedLeadId = message.leadId;
    } else if (classification.intent === ReplyIntent.PRICE_REQUEST) {
      await prisma.lead.update({ where: { id: message.leadId }, data: { stage: "REPLIED" } });
    } else {
      await prisma.lead.update({ where: { id: message.leadId }, data: { stage: "LOST" } });
    }
  }

  if (interestedLeadId) {
    console.log("Création d'un rendez-vous, d'un devis et d'un client gagné pour le prospect intéressé…");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: interestedLeadId } });

    await prisma.appointment.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        ownerId: salesUser.id,
        title: "Présentation de l'offre",
        startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        location: "Sur place",
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "APPOINTMENT_SCHEDULED" } });

    const opportunity = await prisma.opportunity.create({
      data: { organizationId: organization.id, leadId: lead.id, name: "Visite virtuelle premium", estimatedValue: 45000, probability: 70 },
    });

    const service = await prisma.service.findFirstOrThrow({ where: { organizationId: organization.id, kind: "VIRTUAL_TOUR_PREMIUM" } });
    const quote = await prisma.quote.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        opportunityId: opportunity.id,
        reference: "DEV-2026-0001",
        totalAmount: service.basePrice,
        status: "SENT",
        sentAt: new Date(),
        lines: { create: [{ serviceId: service.id, label: service.name, quantity: 1, unitPrice: service.basePrice }] },
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "QUOTE_SENT" } });

    await prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await prisma.opportunity.update({ where: { id: opportunity.id }, data: { status: "WON" } });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "WON" } });
    await onDealWon(lead.id, organization.id);
  }

  console.log("Ajout d'un prospect en liste d'exclusion (démonstration RGPD)…");
  const excludedLead = createdLeads[createdLeads.length - 1];
  const excludedContact = await prisma.leadContact.findFirst({ where: { leadId: excludedLead.id } });
  await addSuppression({ organizationId: organization.id, email: excludedContact?.email ?? undefined, reason: SuppressionReason.MANUAL_EXCLUSION, note: "Demande explicite de ne plus être contacté (démo)." });
  await prisma.lead.update({ where: { id: excludedLead.id }, data: { isSuppressed: true, suppressedAt: new Date(), stage: "UNSUBSCRIBED" } });

  console.log("\n✅ Données de démonstration créées.\n");
  console.log("Comptes de démonstration (mot de passe identique pour tous) :");
  console.log(`  Administrateur : ${DEMO_ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Commercial     : ${DEMO_SALES_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Prestataire    : ${DEMO_PROVIDER_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
