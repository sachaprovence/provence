import "server-only";
import { resolveChannelConfig, channelConfigValue } from "../config";
import { twilioApiRequest, escapeXml } from "./twilio-client";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur "appel sortant" réel (v1.1, AR-0170) — déclenche un appel
 * serveur-à-serveur via `POST /Calls.json`, avec un document TwiML minimal
 * passé en ligne (paramètre `Twiml`, pas besoin d'une URL de webhook
 * publique) qui fait lire `message.body` au destinataire par synthèse
 * vocale (`<Say>`). Configuration par organisation (`Integration.config`,
 * kind PHONE), repli sur `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
 * `TWILIO_PHONE_FROM_NUMBER`.
 */
export class TwilioPhoneProvider implements CommunicationChannelProvider {
  readonly key = "twilio";
  readonly channel = "PHONE" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const config = await resolveChannelConfig(message.organizationId, "PHONE");
    const accountSid = channelConfigValue(config, "accountSid", "TWILIO_ACCOUNT_SID");
    const authToken = channelConfigValue(config, "authToken", "TWILIO_AUTH_TOKEN");
    const fromNumber = channelConfigValue(config, "fromNumber", "TWILIO_PHONE_FROM_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return {
        status: "failed",
        error:
          "Fournisseur Twilio Téléphone non configuré : accountSid/authToken/fromNumber requis (Integration.config ou variables d'environnement) — voir Paramètres → Intégrations.",
      };
    }

    const apiBaseUrl = channelConfigValue(config, "apiBaseUrl", "TWILIO_API_BASE_URL");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="fr-FR">${escapeXml(message.body)}</Say></Response>`;

    try {
      const result = await twilioApiRequest({ accountSid, authToken, apiBaseUrl }, "Calls.json", {
        To: message.to,
        From: fromNumber,
        Twiml: twiml,
      });
      return { externalId: result.sid, status: "sent" };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
