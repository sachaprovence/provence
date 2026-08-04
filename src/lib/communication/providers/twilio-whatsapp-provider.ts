import "server-only";
import { resolveChannelConfig, channelConfigValue } from "../config";
import { twilioApiRequest } from "./twilio-client";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur WhatsApp Business réel (v1.1, AR-0170) — même endpoint Twilio
 * que le SMS (`POST /Messages.json`), avec le préfixe `whatsapp:` requis
 * par Twilio sur `To`/`From` (voir la doc Twilio WhatsApp Business API).
 * Configuration par organisation (`Integration.config`, kind WHATSAPP),
 * repli sur `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
 * `TWILIO_WHATSAPP_FROM_NUMBER`.
 */
export class TwilioWhatsAppProvider implements CommunicationChannelProvider {
  readonly key = "twilio";
  readonly channel = "WHATSAPP" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const config = await resolveChannelConfig(message.organizationId, "WHATSAPP");
    const accountSid = channelConfigValue(config, "accountSid", "TWILIO_ACCOUNT_SID");
    const authToken = channelConfigValue(config, "authToken", "TWILIO_AUTH_TOKEN");
    const fromNumber = channelConfigValue(config, "fromNumber", "TWILIO_WHATSAPP_FROM_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return {
        status: "failed",
        error:
          "Fournisseur Twilio WhatsApp non configuré : accountSid/authToken/fromNumber requis (Integration.config ou variables d'environnement) — voir Paramètres → Intégrations.",
      };
    }

    const apiBaseUrl = channelConfigValue(config, "apiBaseUrl", "TWILIO_API_BASE_URL");

    try {
      const result = await twilioApiRequest({ accountSid, authToken, apiBaseUrl }, "Messages.json", {
        To: `whatsapp:${message.to}`,
        From: `whatsapp:${fromNumber}`,
        Body: message.body,
      });
      return { externalId: result.sid, status: "sent" };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
