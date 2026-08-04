import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { captureExceptionBestEffort } from "@/lib/observability/error-tracking";

/**
 * Erreur applicative "attendue" : le message est écrit pour être affiché
 * tel quel au client (`expose: true` par défaut). Pour une erreur inattendue
 * (bug), ne pas utiliser `AppError` — laisser l'exception d'origine remonter,
 * `toApiErrorResponse` la traitera comme un incident opaque (voir plus bas).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { statusCode?: number; expose?: boolean; details?: unknown; cause?: unknown } = {}
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.expose = options.expose ?? true;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Données invalides.", details?: unknown) {
    super(message, { statusCode: 400, expose: true, details });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Non authentifié.") {
    super(message, { statusCode: 401, expose: true });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Accès refusé.") {
    super(message, { statusCode: 403, expose: true });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Ressource introuvable.") {
    super(message, { statusCode: 404, expose: true });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflit avec l'état actuel de la ressource.", details?: unknown) {
    super(message, { statusCode: 409, expose: true, details });
    this.name = "ConflictError";
  }
}

/** Quota dépassé (ex. quota IA mensuel par organisation, AR-0051) — erreur métier attendue, jamais un incident (voir `toApiErrorResponse`). */
export class QuotaExceededError extends AppError {
  constructor(message = "Quota dépassé.", details?: unknown) {
    super(message, { statusCode: 429, expose: true, details });
    this.name = "QuotaExceededError";
  }
}

/** Débit dépassé ou compte temporairement verrouillé (v0.10, AR-0155) — erreur métier attendue, jamais un incident. */
export class TooManyRequestsError extends AppError {
  constructor(message = "Trop de requêtes.", details?: unknown) {
    super(message, { statusCode: 429, expose: true, details });
    this.name = "TooManyRequestsError";
  }
}

/**
 * Convertit n'importe quelle erreur (`AppError` ou exception inattendue) en
 * `NextResponse` JSON, en journalisant systématiquement côté serveur.
 *
 * - `AppError` : le message est renvoyé au client tel quel (il a été écrit
 *   pour ça), journalisé en `warn` (4xx) ou `error` (5xx).
 * - toute autre erreur : traitée comme un incident inattendu — jamais le
 *   message brut de l'exception n'est renvoyé au client (il peut contenir
 *   des détails internes sensibles), seulement un identifiant d'incident
 *   permettant de retrouver la trace complète dans les logs serveur.
 */
export function toApiErrorResponse(error: unknown, context?: Record<string, unknown>): NextResponse {
  if (error instanceof AppError) {
    const log = error.statusCode >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
    log({ err: error, statusCode: error.statusCode, ...context }, error.message);
    // Capture externe (AR-0048) réservée aux incidents (5xx) — un 4xx est une erreur métier attendue, pas un incident.
    if (error.statusCode >= 500) {
      captureExceptionBestEffort(error, { statusCode: error.statusCode, ...context });
    }
    return NextResponse.json(
      { error: error.expose ? error.message : "Une erreur est survenue.", details: error.details },
      { status: error.statusCode }
    );
  }

  const incidentId = crypto.randomUUID();
  logger.error({ err: error, incidentId, ...context }, "Erreur inattendue.");
  captureExceptionBestEffort(error, { incidentId, statusCode: 500, ...context });
  return NextResponse.json(
    {
      error: "Une erreur inattendue est survenue. Contactez le support si le problème persiste.",
      incidentId,
    },
    { status: 500 }
  );
}
