import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { LeadSourceType } from "@/generated/prisma/enums";
import type { AutomationJobHandler } from "../registry";

/**
 * CRUD minimal et réel sur `Lead` — contrairement à `Task`/`Quote`/
 * `Customer`/`Appointment` (stubs honnêtes, voir `not-yet-implemented-actions.ts`
 * et ADR 0022), la création/mise à jour/suppression d'un `Lead` est un
 * accès Prisma simple, sans logique métier complexe imbriquée dans la
 * route existante (contrairement aux devis/factures/rendez-vous) — donc
 * réimplémentable ici sans risquer de dupliquer ou de contourner une
 * logique déjà correcte. N'inclut pas le contrôle de suppression email
 * (`isSuppressed`) de la route API (`POST /api/leads`), volontairement
 * hors périmètre d'un job d'automatisation générique — voir ADR 0037.
 */
type LeadCreateInput = {
  establishmentName: string;
  category?: string;
  websiteUrl?: string;
  city?: string;
  country?: string;
};

export const leadCreateAction: AutomationJobHandler<LeadCreateInput, { leadId: string }> = {
  key: "lead.create",
  name: "Créer un lead",
  description: "Crée un nouveau prospect (Lead).",
  category: "crm",
  async execute(input, context) {
    if (!input.establishmentName?.trim()) {
      throw new ValidationError('Le job "lead.create" nécessite "establishmentName".');
    }
    const source = await prisma.leadSource.create({
      data: { organizationId: context.organizationId, type: LeadSourceType.MANUAL, label: "Automation Engine" },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: context.organizationId,
        establishmentName: input.establishmentName,
        category: (input.category as never) ?? undefined,
        websiteUrl: input.websiteUrl,
        city: input.city,
        country: input.country ?? "France",
        sourceId: source.id,
      },
    });
    await context.log("info", `Lead "${lead.id}" créé.`);
    return { leadId: lead.id };
  },
};

type LeadUpdateInput = { leadId: string; stage?: string; assignedToId?: string };

export const leadUpdateAction: AutomationJobHandler<LeadUpdateInput, { leadId: string }> = {
  key: "lead.update",
  name: "Modifier un lead",
  description: "Modifie un prospect (Lead) existant.",
  category: "crm",
  async execute(input, context) {
    if (!input.leadId) throw new ValidationError('Le job "lead.update" nécessite "leadId".');
    const existing = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: context.organizationId } });
    if (!existing) throw new NotFoundError("Lead introuvable.");

    await prisma.lead.update({
      where: { id: input.leadId },
      data: { stage: (input.stage as never) ?? undefined, assignedToId: input.assignedToId },
    });
    await context.log("info", `Lead "${input.leadId}" modifié.`);
    return { leadId: input.leadId };
  },
};

type LeadDeleteInput = { leadId: string };

export const leadDeleteAction: AutomationJobHandler<LeadDeleteInput, { leadId: string }> = {
  key: "lead.delete",
  name: "Supprimer un lead",
  description: "Supprime un prospect (Lead) existant.",
  category: "crm",
  async execute(input, context) {
    if (!input.leadId) throw new ValidationError('Le job "lead.delete" nécessite "leadId".');
    const existing = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: context.organizationId } });
    if (!existing) throw new NotFoundError("Lead introuvable.");

    await prisma.lead.delete({ where: { id: input.leadId } });
    await context.log("info", `Lead "${input.leadId}" supprimé.`);
    return { leadId: input.leadId };
  },
};
