import "server-only";
import { ValidationError } from "@/lib/errors";
import { buildMicrosoftAuthorizationUrl, exchangeMicrosoftCodeForTokens } from "@/lib/microsoft/oauth";
import { resolveEmailConfig, updateEmailIntegrationConfig, configValue } from "../config";
import { OUTLOOK_SEND_SCOPE } from "./outlook";

function requireRedirectUri(): string {
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    throw new ValidationError(
      "Intégration Outlook non configurée au niveau du déploiement : variable d'environnement MICROSOFT_OAUTH_REDIRECT_URI requise."
    );
  }
  return redirectUri;
}

/** Construit l'URL de consentement OAuth Microsoft — `state` porte l'organizationId (vérifié au retour). */
export async function getOutlookAuthorizationUrl(organizationId: string): Promise<string> {
  const config = await resolveEmailConfig(organizationId);
  const clientId = configValue(config, "clientId", "MICROSOFT_OAUTH_CLIENT_ID");
  if (!clientId) {
    throw new ValidationError("Outlook non configuré : identifiant client OAuth requis (Integration.config.clientId ou MICROSOFT_OAUTH_CLIENT_ID).");
  }

  return buildMicrosoftAuthorizationUrl({
    clientId,
    redirectUri: requireRedirectUri(),
    scope: OUTLOOK_SEND_SCOPE,
    state: organizationId,
    tenant: configValue(config, "tenantId", "MICROSOFT_TENANT_ID"),
    authBaseUrl: configValue(config, "oauthBaseUrl", "MICROSOFT_OAUTH_BASE_URL"),
  });
}

/** Termine le flux OAuth après le retour de Microsoft : échange le code, stocke le refresh_token dans Integration.config (kind EMAIL). */
export async function completeOutlookOAuthFlow(organizationId: string, code: string): Promise<void> {
  const config = await resolveEmailConfig(organizationId);
  const clientId = configValue(config, "clientId", "MICROSOFT_OAUTH_CLIENT_ID");
  const clientSecret = configValue(config, "clientSecret", "MICROSOFT_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new ValidationError("Outlook non configuré : clientId/clientSecret requis.");
  }

  const tokens = await exchangeMicrosoftCodeForTokens({
    code,
    clientId,
    clientSecret,
    redirectUri: requireRedirectUri(),
    scope: OUTLOOK_SEND_SCOPE,
    tenant: configValue(config, "tenantId", "MICROSOFT_TENANT_ID"),
    authBaseUrl: configValue(config, "oauthBaseUrl", "MICROSOFT_OAUTH_BASE_URL"),
  });

  if (!tokens.refresh_token) {
    throw new ValidationError(
      "Microsoft n'a renvoyé aucun refresh_token (le consentement a peut-être déjà été donné précédemment — révoquez l'accès dans votre compte Microsoft et réessayez)."
    );
  }

  await updateEmailIntegrationConfig(organizationId, { clientId, clientSecret, refreshToken: tokens.refresh_token });
}
