import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  isNotificationEnabled,
  NOTIFICATION_PREFERENCE_EVENTS,
} from "@/lib/settings/notification-preferences-service";
import { NotificationChannel } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Préférences de notification par utilisateur (v1.1, AR-0180) — absence de
 * ligne = activé par défaut (comportement inchangé). Une préférence
 * désactivée n'affecte jamais un autre utilisateur ni un autre évènement.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Préférences de notification — notification-preferences-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("sans configuration, tous les évènements x canaux sont activés par défaut", async () => {
    const fixture = await createWorkflowTestFixture("notif-pref-default");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const preferences = await getNotificationPreferences(fixture.user.id);
    expect(preferences).toHaveLength(NOTIFICATION_PREFERENCE_EVENTS.length * 2);
    expect(preferences.every((p) => p.enabled)).toBe(true);

    const enabled = await isNotificationEnabled(fixture.user.id, "quote.signed", NotificationChannel.APP);
    expect(enabled).toBe(true);
  });

  it("désactiver un canal pour un évènement n'affecte que cette combinaison précise", async () => {
    const fixture = await createWorkflowTestFixture("notif-pref-update");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await updateNotificationPreferences(fixture.organization.id, fixture.user.id, [
      { eventKey: "quote.signed", channel: NotificationChannel.APP, enabled: false },
    ]);

    expect(await isNotificationEnabled(fixture.user.id, "quote.signed", NotificationChannel.APP)).toBe(false);
    // Autre canal, même évènement : toujours activé.
    expect(await isNotificationEnabled(fixture.user.id, "quote.signed", NotificationChannel.EMAIL)).toBe(true);
    // Même canal, autre évènement : toujours activé.
    expect(await isNotificationEnabled(fixture.user.id, "invoice.paid", NotificationChannel.APP)).toBe(true);
  });

  it("idempotent : un second appel avec la même valeur ne duplique jamais de ligne", async () => {
    const fixture = await createWorkflowTestFixture("notif-pref-idempotent");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await updateNotificationPreferences(fixture.organization.id, fixture.user.id, [
      { eventKey: "invoice.overdue", channel: NotificationChannel.EMAIL, enabled: false },
    ]);
    await updateNotificationPreferences(fixture.organization.id, fixture.user.id, [
      { eventKey: "invoice.overdue", channel: NotificationChannel.EMAIL, enabled: false },
    ]);

    const rows = await prisma.notificationPreference.findMany({ where: { userId: fixture.user.id } });
    expect(rows).toHaveLength(1);
  });

  it("isolation multi-utilisateur : la préférence d'un utilisateur n'affecte jamais un autre", async () => {
    const fixtureA = await createWorkflowTestFixture("notif-pref-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("notif-pref-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await updateNotificationPreferences(fixtureA.organization.id, fixtureA.user.id, [
      { eventKey: "lead.created", channel: NotificationChannel.APP, enabled: false },
    ]);

    expect(await isNotificationEnabled(fixtureA.user.id, "lead.created", NotificationChannel.APP)).toBe(false);
    expect(await isNotificationEnabled(fixtureB.user.id, "lead.created", NotificationChannel.APP)).toBe(true);
  });
});
