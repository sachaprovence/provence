import "server-only";
import crypto from "node:crypto";
import { generateToken } from "@/lib/auth";

const WEBHOOK_TRIGGER_KEY = "webhook.received";

/**
 * Garantit qu'un noeud déclencheur "webhook.received" a TOUJOURS un secret
 * configuré (v0.10, AR-0156) — corrige une faille réelle : le secret était
 * jusqu'ici optionnel (`if (configuredSecret)`), laissant n'importe quel
 * déclencheur webhook créé sans secret ouvert à quiconque devine
 * `workspaceId` + `workflowKey`/`automationKey` (voir ADR 0019). Génère un
 * secret aléatoire (réutilise `generateToken()`, déjà utilisé pour les
 * jetons de session/réinitialisation) si le noeud n'en fournit pas un
 * explicitement. Partagé par le Workflow Engine et l'Automation Engine —
 * même mécanisme de déclencheur webhook, jamais dupliqué.
 */
export function ensureWebhookTriggerConfig(triggerKey: string, config: unknown): unknown {
  if (triggerKey !== WEBHOOK_TRIGGER_KEY) return config;
  const current = (config ?? {}) as Record<string, unknown>;
  if (typeof current.secret === "string" && current.secret.length > 0) return current;
  return { ...current, secret: generateToken() };
}

/** Comparaison à temps constant (évite une attaque par mesure de temps) — même principe que `unsubscribe-token.ts`. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Authentifie un appel des 7 routes `POST /api/cron/*` par
 * `Authorization: Bearer <CRON_SECRET>` (v1.3, AR-0176) — remplace une
 * comparaison `===` identique dupliquée dans chacune des 7 routes
 * (constat P1 de la revue OWASP v0.10, `docs/security/
 * owasp-review-2026-08-03.md` : non exploitable en pratique — ces routes
 * ne sont jamais appelées par un navigateur — mais incohérent avec
 * `timingSafeStringEqual`, déjà utilisé pour les secrets de webhook).
 * Sans `CRON_SECRET` configuré, refuse toujours (jamais un contournement
 * d'authentification silencieux faute de configuration).
 */
export function isValidCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`);
}
