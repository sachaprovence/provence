import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { isRateLimited } from "@/lib/security/rate-limiter";
import { isSessionOrganizationRestricted } from "@/lib/security/subscription-gate";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/reset-password",
  "/unsubscribe",
  "/workspace-invitations",
  "/api/auth",
  "/api/unsubscribe",
  "/api/health",
  "/api/workspace-invitations",
];

/**
 * Chemins d'API exemptés du blocage d'écriture "organisation restreinte"
 * (v1.0, AR-0063) — une organisation en échec de paiement doit toujours
 * pouvoir régulariser sa facturation (checkout/changement de plan) ; les
 * webhooks entrants (Stripe) et le cron n'utilisent de toute façon jamais
 * de cookie de session.
 */
const SUBSCRIPTION_GATE_EXEMPT_PREFIXES = ["/api/billing", "/api/cron", "/api/settings/billing"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Débit maximal best-effort par IP (v0.10, AR-0155) sur les endpoints
 * d'authentification les plus sensibles — voir `src/lib/security/
 * rate-limiter.ts` pour les limites honnêtes de cette protection (en
 * mémoire par processus). Le Proxy Next.js 16 tourne par défaut sur le
 * runtime Node.js (contrairement à l'ancien `middleware.ts`, limité à
 * l'Edge Runtime), ce qui rend cette vérification possible ici.
 */
const RATE_LIMITED_AUTH_PATHS = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/reset-password/request"]);
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Pose l'identifiant de requête (v1.2, AR-0168) sur toute réponse renvoyée
 * par le proxy — y compris les réponses d'erreur précoces (429/402) — pour
 * qu'un ticket de support ou un log d'accès en amont puisse toujours être
 * relié à une exécution précise, quel que soit le chemin de sortie.
 */
function withRequestId<T extends NextResponse>(response: T, requestId: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  if (request.method === "POST" && RATE_LIMITED_AUTH_PATHS.has(pathname)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`${pathname}:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return withRequestId(NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }), requestId);
    }
  }

  // Transmis au gestionnaire de route (mécanisme Next.js standard) — lisible
  // via `request.headers.get("x-request-id")` (voir `getRequestId`,
  // `src/lib/observability/request-id.ts`) pour corréler ses propres lignes
  // de log à cette requête précise.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);
  const requestInit = { request: { headers: forwardedHeaders } };

  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return withRequestId(NextResponse.next(requestInit), requestId);

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = Boolean(sessionToken);
  if (!hasSession && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withRequestId(NextResponse.redirect(loginUrl), requestId);
  }

  if (
    sessionToken &&
    MUTATING_METHODS.has(request.method) &&
    pathname.startsWith("/api/") &&
    !SUBSCRIPTION_GATE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    if (await isSessionOrganizationRestricted(sessionToken)) {
      return withRequestId(
        NextResponse.json(
          { error: "Abonnement restreint (échec de paiement) — régularisez votre facturation pour reprendre les actions d'écriture." },
          { status: 402 }
        ),
        requestId
      );
    }
  }

  return withRequestId(NextResponse.next(requestInit), requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
