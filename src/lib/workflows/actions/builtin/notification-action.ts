import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { isNotificationEnabled } from "@/lib/settings/notification-preferences-service";
import { NotificationChannel } from "@/generated/prisma/enums";
import type { WorkflowActionHandler } from "../registry";

type NotificationInput = { userId?: string; type: string; title: string; body?: string; link?: string };

/**
 * Crée une notification applicative — respecte les préférences de
 * notification de l'utilisateur ciblé (v1.1, AR-0180), même principe que
 * `automation/actions/builtin/notification-action.ts`.
 */
export const notificationCreateAction: WorkflowActionHandler<NotificationInput, { id: string | null }> = {
  key: "notification.create",
  name: "Créer une notification",
  description: "Crée une notification applicative (générique, pas spécifique à un vertical métier).",
  category: "communication",
  async execute(input, context) {
    if (!input.title?.trim()) throw new ValidationError('L\'action "notification.create" nécessite un "title".');
    const eventKey = input.type || "workflow";

    if (input.userId) {
      const enabled = await isNotificationEnabled(input.userId, eventKey, NotificationChannel.APP);
      if (!enabled) {
        await context.log("info", `Notification ignorée : préférence désactivée pour "${eventKey}" (utilisateur ${input.userId}).`);
        return { id: null };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        userId: input.userId,
        type: eventKey,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
    await context.log("info", `Notification "${notification.id}" créée.`);
    return { id: notification.id };
  },
};
