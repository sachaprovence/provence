import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveGoogleCalendarConfig, storeGoogleCalendarTokens } from "@/lib/calendar/google/config";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Isolation multi-tenant — Calendrier (Google Calendar, v0.10, AR-0055).
 * La config OAuth vit sur `Integration` (kind CALENDAR), sans fonction de
 * liste ni de lecture par id scopée acteur — `resolveGoogleCalendarConfig`/
 * `storeGoogleCalendarTokens` (src/lib/calendar/google/config.ts) prennent
 * un `organizationId` direct. Vérifie qu'un jeton de rafraîchissement
 * (secret) stocké pour une organisation n'est jamais lisible pour une
 * autre.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — configuration Google Calendar (Integration kind=CALENDAR)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("le jeton de rafraîchissement Google Calendar d'une organisation n'est jamais lisible pour une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("calendar-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("calendar-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await storeGoogleCalendarTokens(fixtureA.organization.id, "refresh-token-a");
    await storeGoogleCalendarTokens(fixtureB.organization.id, "refresh-token-b");

    const configA = await resolveGoogleCalendarConfig(fixtureA.organization.id);
    const configB = await resolveGoogleCalendarConfig(fixtureB.organization.id);

    expect(configA.refreshToken).toBe("refresh-token-a");
    expect(configB.refreshToken).toBe("refresh-token-b");
  });

  it("les lignes d'intégration calendrier ne sont jamais partagées entre organisations", async () => {
    const fixtureA = await createWorkflowTestFixture("calendar-isolation-rows-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("calendar-isolation-rows-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await storeGoogleCalendarTokens(fixtureA.organization.id, "refresh-token-rows-a");

    const rowsForB = await prisma.integration.findMany({ where: { organizationId: fixtureB.organization.id, kind: "CALENDAR" } });
    expect(rowsForB).toHaveLength(0);
  });
});
