import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import type { AutomationJobHandler } from "../registry";

/**
 * Création réelle d'une tâche de suivi (v1.4, AR-0181) — remplace le stub
 * "task.create" de `not-yet-implemented-actions.ts` : contrairement à
 * `quote.create`/`invoice.create`/`appointment.create` (logique métier
 * complexe imbriquée dans des routes existantes), la création d'une `Task`
 * est un accès Prisma simple (même principe que `lead-actions.ts`),
 * réimplémentable ici sans risque de dupliquer/contourner une logique déjà
 * correcte.
 */
type TaskCreateInput = {
  title: string;
  description?: string;
  leadId?: string;
  assigneeId?: string;
  dueInDays?: number;
};

export const taskCreateAction: AutomationJobHandler<TaskCreateInput, { taskId: string }> = {
  key: "task.create",
  name: "Créer une tâche de suivi",
  description: "Crée une tâche de suivi (Task), optionnellement rattachée à un prospect et assignée à un utilisateur.",
  category: "crm",
  async execute(input, context) {
    if (!input.title?.trim()) {
      throw new ValidationError('Le job "task.create" nécessite "title".');
    }

    if (input.leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: context.organizationId } });
      if (!lead) throw new ValidationError(`Lead "${input.leadId}" introuvable dans cette organisation.`);
    }

    const dueAt = typeof input.dueInDays === "number" ? new Date(Date.now() + input.dueInDays * 24 * 60 * 60 * 1000) : undefined;

    const task = await prisma.task.create({
      data: {
        organizationId: context.organizationId,
        leadId: input.leadId,
        assigneeId: input.assigneeId,
        title: input.title,
        description: input.description,
        dueAt,
      },
    });
    await context.log("info", `Tâche "${task.id}" créée : "${input.title}".`);
    return { taskId: task.id };
  },
};
