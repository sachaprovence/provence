import crypto from "node:crypto";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur SMS simulé : aucun envoi réseau réel (un vrai fournisseur —
 * Twilio, Vonage, OVH SMS... — nécessite des identifiants que cet
 * environnement ne possède pas, contrairement à l'email/Google Calendar
 * que le brief demande explicitement de rendre réels). Implémenter
 * `CommunicationChannelProvider` dans un nouveau fichier et l'enregistrer
 * dans `bootstrap.ts` pour brancher un vrai fournisseur.
 */
export class SmsDemoProvider implements CommunicationChannelProvider {
  readonly key = "demo";
  readonly channel = "SMS" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const looksInvalid = !/^\+?[0-9]{6,15}$/.test(message.to);
    if (looksInvalid) {
      return { status: "failed", error: "Numéro de téléphone invalide (simulation)." };
    }
    return { externalId: crypto.randomUUID(), status: "sent" };
  }
}
