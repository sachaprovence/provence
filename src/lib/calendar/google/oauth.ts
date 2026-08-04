import "server-only";
import { buildGoogleAuthorizationUrl, exchangeGoogleCodeForTokens, refreshGoogleAccessToken } from "@/lib/google/oauth";
import type { GoogleCalendarConfig } from "./types";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  authBaseUrl?: string;
}): string {
  return buildGoogleAuthorizationUrl({ ...params, scope: GOOGLE_CALENDAR_SCOPE });
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthBaseUrl?: string;
}) {
  return exchangeGoogleCodeForTokens(params);
}

/** Renouvelle un jeton d'accès à partir du `refresh_token` — appelé avant chaque appel API (jeton valide ~1h). */
export async function refreshAccessToken(config: GoogleCalendarConfig): Promise<string> {
  return refreshGoogleAccessToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
    oauthBaseUrl: config.oauthBaseUrl,
    integrationLabel: "Google Calendar",
  });
}
