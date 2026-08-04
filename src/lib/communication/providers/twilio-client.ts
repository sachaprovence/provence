import "server-only";

/**
 * Aide REST partagée pour l'API Twilio (v1.1, AR-0170) — pas de SDK
 * (`twilio` npm), `fetch()` + Basic Auth + corps
 * `application/x-www-form-urlencoded`, même convention que
 * Stripe/Sentry/Gmail/Outlook (voir ADR 0043).
 */
export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Surcharge pour les tests — jamais utilisée en production. */
  apiBaseUrl?: string;
}

const DEFAULT_TWILIO_API_BASE_URL = "https://api.twilio.com/2010-04-01";

export async function twilioApiRequest(
  credentials: TwilioCredentials,
  resourcePath: string,
  params: Record<string, string>
): Promise<{ sid: string; status: string }> {
  const baseUrl = credentials.apiBaseUrl ?? DEFAULT_TWILIO_API_BASE_URL;
  const url = `${baseUrl}/Accounts/${credentials.accountSid}/${resourcePath}`;
  const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Twilio a répondu ${response.status} : ${message}`);
  }
  return data;
}

/** Échappe le texte inséré dans le document TwiML minimal (`<Say>`) — voir `twilio-phone-provider.ts`. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
