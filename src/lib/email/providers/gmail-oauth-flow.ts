import "server-only";
import { ValidationError } from "@/lib/errors";
import { buildGoogleAuthorizationUrl, exchangeGoogleCodeForTokens } from "@/lib/google/oauth";
import { resolveEmailConfig, updateEmailIntegrationConfig, configValue } from "../config";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function requireRedirectUri(): string {
  const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    throw new ValidationError(
      "Intégration Gmail non configurée au niveau du déploiement : variable d'environnement GMAIL_OAUTH_REDIRECT_URI requise."
    );
  }
  return redirectUri;
}

/** Construit l'URL de consentement OAuth Gmail — `state` porte l'organizationId (vérifié au retour). */
export async function getGmailAuthorizationUrl(organizationId: string): Promise<string> {
  const config = await resolveEmailConfig(organizationId);
  const clientId = configValue(config, "clientId", "GMAIL_OAUTH_CLIENT_ID");
  if (!clientId) {
    throw new ValidationError("Gmail non configuré : identifiant client OAuth requis (Integration.config.clientId ou GMAIL_OAUTH_CLIENT_ID).");
  }

  return buildGoogleAuthorizationUrl({
    clientId,
    redirectUri: requireRedirectUri(),
    scope: GMAIL_SEND_SCOPE,
    state: organizationId,
  });
}

/** Termine le flux OAuth après le retour de Google : échange le code, stocke le refresh_token dans Integration.config (kind EMAIL). */
export async function completeGmailOAuthFlow(organizationId: string, code: string): Promise<void> {
  const config = await resolveEmailConfig(organizationId);
  const clientId = configValue(config, "clientId", "GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = configValue(config, "clientSecret", "GMAIL_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new ValidationError("Gmail non configuré : clientId/clientSecret requis.");
  }

  const tokens = await exchangeGoogleCodeForTokens({
    code,
    clientId,
    clientSecret,
    redirectUri: requireRedirectUri(),
    oauthBaseUrl: configValue(config, "oauthBaseUrl", "GMAIL_OAUTH_BASE_URL"),
  });

  if (!tokens.refresh_token) {
    throw new ValidationError(
      "Google n'a renvoyé aucun refresh_token (le consentement a peut-être déjà été donné précédemment — révoquez l'accès dans votre compte Google et réessayez)."
    );
  }

  await updateEmailIntegrationConfig(organizationId, { clientId, clientSecret, refreshToken: tokens.refresh_token });
}
