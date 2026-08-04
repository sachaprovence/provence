import "server-only";
import { resolveChannelConfig, channelConfigValue } from "../config";
import { twilioApiRequest } from "./twilio-client";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur SMS réel (v1.1, AR-0170) — API REST Twilio
 * (`POST /Messages.json`). Configuration par organisation
 * (`Integration.config`, kind SMS : `accountSid`/`authToken`/`fromNumber`),
 * repli sur `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
 * `TWILIO_SMS_FROM_NUMBER`. Échoue explicitement si non configuré ou si
 * l'appel réseau échoue — jamais un succès simulé (même convention que
 * les fournisseurs email réels).
 */
export class TwilioSmsProvider implements CommunicationChannelProvider {
  readonly key = "twilio";
  readonly channel = "SMS" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const config = await resolveChannelConfig(message.organizationId, "SMS");
    const accountSid = channelConfigValue(config, "accountSid", "TWILIO_ACCOUNT_SID");
    const authToken = channelConfigValue(config, "authToken", "TWILIO_AUTH_TOKEN");
    const fromNumber = channelConfigValue(config, "fromNumber", "TWILIO_SMS_FROM_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return {
        status: "failed",
        error:
          "Fournisseur Twilio SMS non configuré : accountSid/authToken/fromNumber requis (Integration.config ou variables d'environnement) — voir Paramètres → Intégrations.",
      };
    }

    const apiBaseUrl = channelConfigValue(config, "apiBaseUrl", "TWILIO_API_BASE_URL");

    try {
      const result = await twilioApiRequest({ accountSid, authToken, apiBaseUrl }, "Messages.json", {
        To: message.to,
        From: fromNumber,
        Body: message.body,
      });
      return { externalId: result.sid, status: "sent" };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
