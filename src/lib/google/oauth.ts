import "server-only";
import { logger } from "@/lib/logger";

const DEFAULT_OAUTH_BASE_URL = "https://oauth2.googleapis.com";
const DEFAULT_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Client OAuth2 Google GÉNÉRIQUE (v0.9 bis, AR-0053/0054) — extrait de
 * `src/lib/calendar/google/oauth.ts` (v0.9) pour être partagé par TOUTE
 * intégration Google (Calendar, Gmail...), chacune passant son propre
 * `scope`. `calendar/google/oauth.ts` délègue maintenant ici en conservant
 * ses signatures d'origine exactes (zéro régression sur l'intégration
 * Google Calendar déjà livrée).
 */
export function buildGoogleAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  authBaseUrl?: string;
}): string {
  const url = new URL(params.authBaseUrl ?? DEFAULT_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/** Échange un code d'autorisation contre un jeu de jetons — le `refresh_token` n'est renvoyé qu'au premier consentement. */
export async function exchangeGoogleCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthBaseUrl?: string;
}): Promise<GoogleTokenResponse> {
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

  return response.json() as Promise<GoogleTokenResponse>;
}

/** Renouvelle un jeton d'accès à partir du `refresh_token` — appelé avant chaque appel API (jeton valide ~1h). */
export async function refreshGoogleAccessToken(params: {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  oauthBaseUrl?: string;
  /** Nom lisible de l'intégration pour un message d'erreur explicite (ex. "Google Calendar", "Gmail"). */
  integrationLabel: string;
}): Promise<string> {
  if (!params.clientId || !params.clientSecret || !params.refreshToken) {
    throw new Error(
      `${params.integrationLabel} non configuré : clientId/clientSecret/refreshToken requis (Integration.config ou variables d'environnement).`
    );
  }

  const response = await fetch(`${params.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn({ status: response.status, body: body.slice(0, 300), integration: params.integrationLabel }, "Échec du renouvellement du jeton OAuth Google.");
    throw new Error(`Renouvellement du jeton ${params.integrationLabel} échoué (${response.status}) : ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return data.access_token;
}
