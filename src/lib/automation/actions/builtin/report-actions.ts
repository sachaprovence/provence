import "server-only";
import { prisma } from "@/lib/prisma";
import type { AutomationJobHandler } from "../registry";

/**
 * Résumé quotidien de l'activité (v1.4, AR-0181) — agrégation directe
 * (comptages Prisma simples), aucun appel IA : plus fiable et moins coûteux
 * qu'un résumé généré, pour une simple liste de compteurs. Notification
 * diffusée à toute l'organisation (`userId` non renseigné, même convention
 * que `notification.create`).
 */
export const dailySummaryReportAction: AutomationJobHandler<Record<string, never>, { notificationId: string }> = {
  key: "report.daily_summary",
  name: "Résumé quotidien de l'activité",
  description: "Agrège l'activité des dernières 24h (nouveaux prospects, messages envoyés, rendez-vous, exécutions d'automatisation) et diffuse une notification.",
  category: "reporting",
  async execute(_input, context) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { organizationId } = context;

    const [newLeads, messagesSent, appointmentsCreated, automationRunsSucceeded, automationRunsFailed] = await Promise.all([
      prisma.lead.count({ where: { organizationId, createdAt: { gte: since } } }),
      prisma.message.count({ where: { lead: { organizationId }, status: "SENT", sentAt: { gte: since } } }),
      prisma.appointment.count({ where: { organizationId, createdAt: { gte: since } } }),
      prisma.automationRun.count({ where: { organizationId, status: "SUCCEEDED", createdAt: { gte: since } } }),
      prisma.automationRun.count({ where: { organizationId, status: "FAILED", createdAt: { gte: since } } }),
    ]);

    const body = [
      `${newLeads} nouveau(x) prospect(s)`,
      `${messagesSent} message(s) envoyé(s)`,
      `${appointmentsCreated} rendez-vous créé(s)`,
      `${automationRunsSucceeded} automatisation(s) réussie(s)`,
      automationRunsFailed > 0 ? `${automationRunsFailed} automatisation(s) en échec` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const notification = await prisma.notification.create({
      data: {
        organizationId,
        type: "report.daily_summary",
        title: "Résumé quotidien de l'activité",
        body,
        link: "/dashboards",
      },
    });
    await context.log("info", `Résumé quotidien diffusé (notification "${notification.id}").`);
    return { notificationId: notification.id };
  },
};
