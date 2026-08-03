import "server-only";
import { logger } from "@/lib/logger";
import type { GoogleCalendarConfig } from "./types";

const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar";
const DEFAULT_OAUTH_BASE_URL = "https://oauth2.googleapis.com";
const DEFAULT_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  authBaseUrl?: string;
}): string {
  const url = new URL(params.authBaseUrl ?? DEFAULT_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/** Échange un code d'autorisation contre un jeu de jetons — le `refresh_token` n'est renvoyé qu'au premier consentement. */
export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthBaseUrl?: string;
}): Promise<TokenResponse> {
  const response = await fetch(`${params.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Échange du code OAuth Google échoué (${response.status}) : ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** Renouvelle un jeton d'accès à partir du `refresh_token` — appelé avant chaque appel API (jeton valide ~1h). */
export async function refreshAccessToken(config: GoogleCalendarConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error(
      "Google Calendar non configuré : clientId/clientSecret/refreshToken requis (Integration.config ou variables d'environnement)."
    );
  }

  const response = await fetch(`${config.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn({ status: response.status, body: body.slice(0, 300) }, "Échec du renouvellement du jeton Google Calendar.");
    throw new Error(`Renouvellement du jeton Google Calendar échoué (${response.status}) : ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}
