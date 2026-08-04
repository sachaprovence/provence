import "server-only";
import { logger } from "@/lib/logger";

const DEFAULT_TENANT = "common";

function authBaseUrl(tenant: string, override?: string): string {
  return override ?? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

/**
 * Client OAuth2 Microsoft (Azure AD / Entra ID) GÉNÉRIQUE (v0.9 bis,
 * AR-0054) — même rôle que `src/lib/google/oauth.ts` (AR-0053) pour les
 * intégrations Microsoft (Outlook aujourd'hui, potentiellement Teams/
 * SharePoint plus tard), chacune passant son propre `scope`. `tenant`
 * (`common` par défaut = comptes personnels ET professionnels/scolaires)
 * est configurable par organisation — voir `resolveOutlookConfig`.
 */
export function buildMicrosoftAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  tenant?: string;
  authBaseUrl?: string;
}): string {
  const url = new URL(`${authBaseUrl(params.tenant ?? DEFAULT_TENANT, params.authBaseUrl)}/authorize`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** Échange un code d'autorisation contre un jeu de jetons. Microsoft exige le `scope` à nouveau (avec `offline_access` pour obtenir un `refresh_token`). */
export async function exchangeMicrosoftCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  tenant?: string;
  authBaseUrl?: string;
}): Promise<MicrosoftTokenResponse> {
  const response = await fetch(`${authBaseUrl(params.tenant ?? DEFAULT_TENANT, params.authBaseUrl)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      scope: params.scope,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Échange du code OAuth Microsoft échoué (${response.status}) : ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<MicrosoftTokenResponse>;
}

/** Renouvelle un jeton d'accès à partir du `refresh_token` — appelé avant chaque appel Microsoft Graph (jeton valide ~1h). */
export async function refreshMicrosoftAccessToken(params: {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  scope: string;
  tenant?: string;
  authBaseUrl?: string;
  /** Nom lisible de l'intégration pour un message d'erreur explicite (ex. "Outlook"). */
  integrationLabel: string;
}): Promise<string> {
  if (!params.clientId || !params.clientSecret || !params.refreshToken) {
    throw new Error(
      `${params.integrationLabel} non configuré : clientId/clientSecret/refreshToken requis (Integration.config ou variables d'environnement).`
    );
  }

  const response = await fetch(`${authBaseUrl(params.tenant ?? DEFAULT_TENANT, params.authBaseUrl)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      scope: params.scope,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn({ status: response.status, body: body.slice(0, 300), integration: params.integrationLabel }, "Échec du renouvellement du jeton OAuth Microsoft.");
    throw new Error(`Renouvellement du jeton ${params.integrationLabel} échoué (${response.status}) : ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as MicrosoftTokenResponse;
  return data.access_token;
}
