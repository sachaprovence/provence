import crypto from "node:crypto";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * "Canal téléphone" simulé : un appel ne se "envoie" pas comme un message —
 * ce fournisseur simule l'enregistrement d'une DEMANDE D'APPEL (ce qu'un
 * vrai fournisseur de téléphonie/VoIP — Aircall, Twilio Voice... —
 * déclencherait réellement). `message.body` sert de note de contexte pour
 * l'appel (ex. objet de la relance).
 */
export class PhoneDemoProvider implements CommunicationChannelProvider {
  readonly key = "demo";
  readonly channel = "PHONE" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const looksInvalid = !/^\+?[0-9]{6,15}$/.test(message.to);
    if (looksInvalid) {
      return { status: "failed", error: "Numéro de téléphone invalide (simulation)." };
    }
    return { externalId: crypto.randomUUID(), status: "sent" };
  }
}
