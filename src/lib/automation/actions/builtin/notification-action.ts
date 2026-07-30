import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import type { AutomationJobHandler } from "../registry";

type NotificationInput = { userId?: string; type: string; title: string; body?: string; link?: string };

export const notificationCreateAction: AutomationJobHandler<NotificationInput, { id: string }> = {
  key: "notification.create",
  name: "Créer une notification",
  description: "Crée une notification applicative (générique, pas spécifique à un vertical métier).",
  category: "communication",
  async execute(input, context) {
    if (!input.title?.trim()) throw new ValidationError('Le job "notification.create" nécessite un "title".');
    const notification = await prisma.notification.create({
      data: {
        organizationId: context.organizationId,
        userId: input.userId,
        type: input.type || "automation",
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
    await context.log("info", `Notification "${notification.id}" créée.`);
    return { id: notification.id };
  },
};
