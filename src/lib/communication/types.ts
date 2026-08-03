/**
 * Centre de communication unifié (brief v0.9 : "Centre de communication
 * unifié... Toutes les intégrations impossibles actuellement peuvent
 * rester sous forme de stubs honnêtes. L'architecture doit permettre de
 * brancher facilement les vrais fournisseurs.") — voir ADR 0038.
 *
 * L'email garde son abstraction dédiée déjà existante (`src/lib/email/`,
 * plus riche : `EmailAccount`/`Message`/`Conversation`/`EmailEvent`) — ce
 * registre couvre les canaux additionnels du brief (SMS, WhatsApp,
 * Téléphone, Webhooks sortants).
 */

export type CommunicationChannel = "SMS" | "WHATSAPP" | "PHONE" | "WEBHOOK";

export interface OutboundCommunication {
  organizationId: string;
  /** Numéro de téléphone (E.164), URL de webhook... selon le canal. */
  to: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface CommunicationSendResult {
  externalId?: string;
  status: "sent" | "failed";
  error?: string;
}

export interface CommunicationChannelProvider {
  readonly key: string;
  readonly channel: CommunicationChannel;
  send(message: OutboundCommunication): Promise<CommunicationSendResult>;
}
