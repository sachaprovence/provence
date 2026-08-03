import "server-only";
import crypto from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Capture d'erreurs applicatives (brief v0.9 bis, AR-0048) — intégration
 * RÉELLE et complète de l'API d'ingestion Sentry via `fetch()` direct
 * (protocole "envelope", format documenté publiquement) plutôt que le SDK
 * `@sentry/node` — même convention que les fournisseurs LLM/email/Google
 * Calendar (v0.5-v0.9) : jamais de SDK tiers lourd pour un appel HTTP simple.
 *
 * Le CHOIX d'activer la capture est un réglage de déploiement
 * (`SENTRY_DSN`), pas par organisation — même principe que le fournisseur
 * IA (ADR 0015/0039). Sans DSN configuré, `captureException` échoue
 * EXPLICITEMENT (`captured: false`, jamais un faux succès) — le journal
 * structuré (`logger.error`, déjà systématique dans `toApiErrorResponse`)
 * reste dans tous les cas la source de vérité première.
 */
export interface CaptureErrorContext {
  route?: string;
  organizationId?: string;
  userId?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export type CaptureResult = { captured: true } | { captured: false; reason: string };

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

/** DSN Sentry : `https://<publicKey>@<host>/<projectId>` (auto-hébergé : `.../<path>/<projectId>`). */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return { publicKey, host: url.host, projectId };
  } catch {
    return null;
  }
}

function envelopeEndpoint(parsed: ParsedDsn, baseUrl?: string): string {
  const origin = baseUrl ?? `https://${parsed.host}`;
  return `${origin}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}&sentry_version=7`;
}

/**
 * Envoie un évènement d'erreur à Sentry. `baseUrl` permet de cibler un
 * serveur de test local (voir `tests/observability/error-tracking.test.ts`),
 * jamais utilisé en production (l'URL réelle de Sentry est toujours dérivée
 * du DSN).
 */
export async function captureException(
  error: unknown,
  context: CaptureErrorContext = {},
  options: { dsn?: string; baseUrl?: string } = {}
): Promise<CaptureResult> {
  const dsn = options.dsn ?? process.env.SENTRY_DSN;
  if (!dsn) return { captured: false, reason: "SENTRY_DSN non configuré." };

  const parsed = parseDsn(dsn);
  if (!parsed) return { captured: false, reason: "SENTRY_DSN invalide." };

  const message = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.name : "Error";
  const stack = error instanceof Error ? error.stack : undefined;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();

  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: "node",
    level: "error",
    message,
    exception: { values: [{ type: errorType, value: message }] },
    tags: { route: context.route ?? "unknown" },
    extra: { ...context, stack },
  };

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  try {
    const response = await fetch(envelopeEndpoint(parsed, options.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
    if (!response.ok) {
      const reason = `Sentry a répondu ${response.status} ${response.statusText}.`;
      logger.warn({ status: response.status }, "Échec de l'envoi de l'évènement à Sentry.");
      return { captured: false, reason };
    }
    return { captured: true };
  } catch (fetchError) {
    logger.warn({ err: fetchError }, "Échec réseau lors de l'envoi de l'évènement à Sentry.");
    return { captured: false, reason: fetchError instanceof Error ? fetchError.message : "Erreur réseau." };
  }
}

/**
 * Version "best-effort" (ne jamais faire échouer l'appelant) pour les
 * points d'appel synchrones (`toApiErrorResponse`) — même principe que
 * `reportClientError` : on est déjà dans un chemin d'erreur, il ne faut
 * jamais en ajouter une seconde.
 */
export function captureExceptionBestEffort(error: unknown, context: CaptureErrorContext = {}): void {
  captureException(error, context).catch(() => {
    // Ignoré volontairement — voir le commentaire ci-dessus.
  });
}
