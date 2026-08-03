import "server-only";
import { ValidationError } from "@/lib/errors";
import { resolveGoogleCalendarConfig, storeGoogleCalendarTokens } from "./config";
import { buildAuthorizationUrl, exchangeCodeForTokens } from "./oauth";

function requireRedirectUri(): string {
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    throw new ValidationError(
      "Intégration Google Calendar non configurée au niveau du déploiement : variable d'environnement GOOGLE_OAUTH_REDIRECT_URI requise."
    );
  }
  return redirectUri;
}

/** Construit l'URL de consentement OAuth Google — `state` porte l'organisationId (vérifié au retour). */
export async function getGoogleAuthorizationUrl(organizationId: string): Promise<string> {
  const config = await resolveGoogleCalendarConfig(organizationId);
  if (!config.clientId) {
    throw new ValidationError(
      "Google Calendar non configuré : identifiant client OAuth requis (Integration.config.clientId ou GOOGLE_OAUTH_CLIENT_ID)."
    );
  }

  return buildAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: requireRedirectUri(),
    state: organizationId,
  });
}

/** Termine le flux OAuth après le retour de Google : échange le code, stocke le refresh_token. */
export async function completeGoogleOAuthFlow(organizationId: string, code: string): Promise<void> {
  const config = await resolveGoogleCalendarConfig(organizationId);
  if (!config.clientId || !config.clientSecret) {
    throw new ValidationError("Google Calendar non configuré : clientId/clientSecret requis.");
  }

  const tokens = await exchangeCodeForTokens({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: requireRedirectUri(),
    oauthBaseUrl: config.oauthBaseUrl,
  });

  if (!tokens.refresh_token) {
    throw new ValidationError(
      "Google n'a renvoyé aucun refresh_token (le consentement a peut-être déjà été donné précédemment — révoquez l'accès dans votre compte Google et réessayez)."
    );
  }

  await storeGoogleCalendarTokens(organizationId, tokens.refresh_token);
}
