import crypto from "node:crypto";
import { logger } from "@/lib/logger";
import type { CommunicationChannelProvider, OutboundCommunication, CommunicationSendResult } from "../types";

/**
 * Fournisseur de webhooks sortants — RÉEL (pas un stub) : contrairement à
 * SMS/WhatsApp/Téléphone, notifier un système externe par une requête HTTP
 * POST ne nécessite aucun identifiant tiers, seulement l'URL cible fournie
 * par l'organisation (`message.to`). Signe le corps avec HMAC-SHA256 si
 * `metadata.secret` est fourni (même convention que la plupart des
 * fournisseurs de webhooks du marché — Stripe, GitHub...).
 */
export class WebhookProvider implements CommunicationChannelProvider {
  readonly key = "http";
  readonly channel = "WEBHOOK" as const;

  async send(message: OutboundCommunication): Promise<CommunicationSendResult> {
    const payload = JSON.stringify({ body: message.body, subject: message.subject, metadata: message.metadata });
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const secret = typeof message.metadata?.secret === "string" ? message.metadata.secret : undefined;
    if (secret) {
      headers["X-Autorun-Signature"] = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    }

    try {
      const response = await fetch(message.to, { method: "POST", headers, body: payload });
      if (!response.ok) {
        return { status: "failed", error: `Webhook a répondu ${response.status} ${response.statusText}.` };
      }
      return { externalId: response.headers.get("x-request-id") ?? undefined, status: "sent" };
    } catch (error) {
      logger.warn({ err: error, url: message.to }, "Échec de l'appel webhook sortant.");
      return { status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
