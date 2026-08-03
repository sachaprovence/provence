import "server-only";
import { registerCommunicationProvider } from "./registry";
import { SmsDemoProvider } from "./providers/sms-demo-provider";
import { WhatsAppDemoProvider } from "./providers/whatsapp-demo-provider";
import { PhoneDemoProvider } from "./providers/phone-demo-provider";
import { WebhookProvider } from "./providers/webhook-provider";

let registered = false;

/**
 * Enregistre tous les fournisseurs connus du Communication Hub (idempotent,
 * protégé par `registered`) — même défaut couvert que pour les
 * fournisseurs LLM (ADR 0013) : appelé défensivement à chaque résolution,
 * pas seulement au démarrage.
 */
export function registerBuiltInCommunicationProviders() {
  if (registered) return;
  registered = true;

  registerCommunicationProvider(new SmsDemoProvider());
  registerCommunicationProvider(new WhatsAppDemoProvider());
  registerCommunicationProvider(new PhoneDemoProvider());
  registerCommunicationProvider(new WebhookProvider());
}
