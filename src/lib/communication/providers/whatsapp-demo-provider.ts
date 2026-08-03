import crypto from "node:crypto";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur WhatsApp simulé : aucun envoi réel (un vrai fournisseur —
 * l'API WhatsApp Business de Meta — nécessite un compte professionnel
 * validé et des identifiants que cet environnement ne possède pas).
 */
export class WhatsAppDemoProvider implements CommunicationChannelProvider {
  readonly key = "demo";
  readonly channel = "WHATSAPP" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const looksInvalid = !/^\+?[0-9]{6,15}$/.test(message.to);
    if (looksInvalid) {
      return { status: "failed", error: "Numéro WhatsApp invalide (simulation)." };
    }
    return { externalId: crypto.randomUUID(), status: "sent" };
  }
}
