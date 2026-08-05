import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createNotification,
  broadcastNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyQuotaWarningOnce,
} from "@/lib/notifications/notification-service";
import { NotificationChannel } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Boîte de réception de notifications (v1.4, AR-0184) — jusqu'ici les
 * notifications étaient créées (Automation/Workflow Engine) mais jamais
 * listables ni marquables comme lues. Vérifie la visibilité (siennes +
 * diffusions larges de l'organisation), le respect des préférences, le
 * dédoublonnage des avertissements de quota, et l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("notification-service (v1.4, AR-0184)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("liste les notifications ciblées ET les diffusions larges de l'organisation, jamais celles d'un autre utilisateur", async () => {
    const fixture = await createWorkflowTestFixture("notif-list");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const other = await prisma.user.create({
      data: { email: `notif-other-${fixture.organization.id}@example.test`, passwordHash: "not-a-real-hash", firstName: "A", lastName: "B" },
    });
    userIds.push(other.id);

    await createNotification({ organizationId: fixture.organization.id, userId: fixture.user.id, type: "test", title: "Pour moi" });
    await createNotification({ organizationId: fixture.organization.id, userId: other.id, type: "test", title: "Pour un autre" });
    await broadcastNotification({ organizationId: fixture.organization.id, type: "test", title: "Diffusion large" });

    const notifications = await listNotifications(fixture.actor);
    const titles = notifications.map((n) => n.title).sort();
    expect(titles).toEqual(["Diffusion large", "Pour moi"].sort());
  });

  it("respecte une préférence désactivée pour l'évènement ciblé (jamais pour une diffusion large)", async () => {
    const fixture = await createWorkflowTestFixture("notif-preference");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await prisma.notificationPreference.create({
      data: { organizationId: fixture.organization.id, userId: fixture.user.id, eventKey: "disabled_event", channel: NotificationChannel.APP, enabled: false },
    });

    const result = await createNotification({ organizationId: fixture.organization.id, userId: fixture.user.id, type: "disabled_event", title: "Ne doit pas exister" });
    expect(result).toBeNull();

    const broadcast = await broadcastNotification({ organizationId: fixture.organization.id, type: "disabled_event", title: "Diffusion, toujours créée" });
    expect(broadcast).not.toBeNull();
  });

  it("markNotificationRead ne marque jamais la notification d'un AUTRE utilisateur/organisation (isolation)", async () => {
    const fixtureA = await createWorkflowTestFixture("notif-isolation-a");
    const fixtureB = await createWorkflowTestFixture("notif-isolation-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);

    const notifB = await createNotification({ organizationId: fixtureB.organization.id, userId: fixtureB.user.id, type: "test", title: "B" });

    const marked = await markNotificationRead(fixtureA.actor, notifB!.id);
    expect(marked).toBe(false);

    const stillUnread = await prisma.notification.findUniqueOrThrow({ where: { id: notifB!.id } });
    expect(stillUnread.readAt).toBeNull();
  });

  it("markAllNotificationsRead marque toutes les notifications visibles, et countUnreadNotifications retombe à 0", async () => {
    const fixture = await createWorkflowTestFixture("notif-mark-all");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await createNotification({ organizationId: fixture.organization.id, userId: fixture.user.id, type: "test", title: "1" });
    await broadcastNotification({ organizationId: fixture.organization.id, type: "test", title: "2" });

    expect(await countUnreadNotifications(fixture.actor)).toBe(2);
    const count = await markAllNotificationsRead(fixture.actor);
    expect(count).toBe(2);
    expect(await countUnreadNotifications(fixture.actor)).toBe(0);
  });

  it("notifyQuotaWarningOnce ne crée qu'UNE notification par organisation/dimension sur 24h", async () => {
    const fixture = await createWorkflowTestFixture("notif-quota-dedup");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const first = await notifyQuotaWarningOnce(fixture.organization.id, "storage", "80/100 Mo utilisés.");
    expect(first).not.toBeNull();
    const second = await notifyQuotaWarningOnce(fixture.organization.id, "storage", "85/100 Mo utilisés.");
    expect(second).toBeNull();

    const count = await prisma.notification.count({ where: { organizationId: fixture.organization.id, type: "quota_warning:storage" } });
    expect(count).toBe(1);
  });
});
