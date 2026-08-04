import "server-only";
import { registerCommunicationProvider } from "./registry";
import { SmsDemoProvider } from "./providers/sms-demo-provider";
import { WhatsAppDemoProvider } from "./providers/whatsapp-demo-provider";
import { PhoneDemoProvider } from "./providers/phone-demo-provider";
import { WebhookProvider } from "./providers/webhook-provider";
import { TwilioSmsProvider } from "./providers/twilio-sms-provider";
import { TwilioWhatsAppProvider } from "./providers/twilio-whatsapp-provider";
import { TwilioPhoneProvider } from "./providers/twilio-phone-provider";

let registered = false;

/**
 * Enregistre tous les fournisseurs connus du Communication Hub (idempotent,
 * protégé par `registered`) — même défaut couvert que pour les
 * fournisseurs LLM (ADR 0013) : appelé défensivement à chaque résolution,
 * pas seulement au démarrage. Les fournisseurs Twilio réels (v1.1,
 * AR-0170) sont enregistrés au même titre que les démos — c'est
 * `resolveChannelProvider()` (résolution par organisation, AR-0171) qui
 * décide lequel utiliser, jamais un remplacement global.
 */
export function registerBuiltInCommunicationProviders() {
  if (registered) return;
  registered = true;

  registerCommunicationProvider(new SmsDemoProvider());
  registerCommunicationProvider(new WhatsAppDemoProvider());
  registerCommunicationProvider(new PhoneDemoProvider());
  registerCommunicationProvider(new WebhookProvider());
  registerCommunicationProvider(new TwilioSmsProvider());
  registerCommunicationProvider(new TwilioWhatsAppProvider());
  registerCommunicationProvider(new TwilioPhoneProvider());
}
