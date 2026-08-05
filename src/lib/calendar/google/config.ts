import "server-only";
import { prisma } from "@/lib/prisma";
import { assertConnectorLimitAvailable } from "@/lib/billing/quota-enforcement";
import type { GoogleCalendarConfig } from "./types";

/** Config Google Calendar par organisation (`Integration.config`, kind CALENDAR), repli sur l'environnement. */
export async function resolveGoogleCalendarConfig(organizationId: string): Promise<GoogleCalendarConfig> {
  const integration = await prisma.integration.findFirst({ where: { organizationId, kind: "CALENDAR" } });
  const config = (integration?.config as GoogleCalendarConfig | null) ?? {};

  return {
    clientId: config.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
    clientSecret: config.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
    refreshToken: config.refreshToken || process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || undefined,
    calendarId: config.calendarId || "primary",
    oauthBaseUrl: config.oauthBaseUrl,
    apiBaseUrl: config.apiBaseUrl,
  };
}

export async function storeGoogleCalendarTokens(organizationId: string, refreshToken: string) {
  const existing = await prisma.integration.findFirst({ where: { organizationId, kind: "CALENDAR" } });
  const config = { ...((existing?.config as GoogleCalendarConfig | null) ?? {}), refreshToken };

  if (existing) {
    return prisma.integration.update({ where: { id: existing.id }, data: { config: config as never, status: "CONNECTED" } });
  }
  await assertConnectorLimitAvailable(organizationId, "CALENDAR");
  return prisma.integration.create({
    data: { organizationId, kind: "CALENDAR", name: "Google Calendar", status: "CONNECTED", config: config as never },
  });
}
