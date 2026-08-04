import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { isRateLimited } from "@/lib/security/rate-limiter";
import { isSessionOrganizationRestricted } from "@/lib/security/subscription-gate";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/request-id";
import { buildCspHeader } from "@/lib/security/csp";

const NONCE_HEADER = "x-nonce";

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
 * Pose l'identifiant de requête (v1.2, AR-0168) et la CSP par nonce (v1.3,
 * AR-0173) sur TOUTE réponse renvoyée par le proxy — y compris les réponses
 * d'erreur précoces (429/402) — pour qu'un ticket de support puisse
 * toujours relier une exécution précise, et qu'aucune réponse ne parte
 * jamais sans protection CSP, quel que soit le chemin de sortie.
 */
function withSecurityHeaders<T extends NextResponse>(response: T, requestId: string, cspHeader: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const nonce = crypto.randomUUID();
  const cspHeader = buildCspHeader(nonce, process.env.NODE_ENV === "development");
  const withHeaders = <T extends NextResponse>(response: T) => withSecurityHeaders(response, requestId, cspHeader);

  if (request.method === "POST" && RATE_LIMITED_AUTH_PATHS.has(pathname)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`${pathname}:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return withHeaders(NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }));
    }
  }

  // Transmis au gestionnaire de route/page (mécanisme Next.js standard) — le
  // request-id est lisible via `request.headers.get("x-request-id")` (voir
  // `getRequestId`, `src/lib/observability/request-id.ts`) ; le nonce via
  // `(await headers()).get("x-nonce")` dans un Server Component (voir
  // `src/app/layout.tsx`) pour l'appliquer au script inline d'init du thème.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);
  forwardedHeaders.set(NONCE_HEADER, nonce);
  const requestInit = { request: { headers: forwardedHeaders } };

  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return withHeaders(NextResponse.next(requestInit));

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = Boolean(sessionToken);
  if (!hasSession && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withHeaders(NextResponse.redirect(loginUrl));
  }

  if (
    sessionToken &&
    MUTATING_METHODS.has(request.method) &&
    pathname.startsWith("/api/") &&
    !SUBSCRIPTION_GATE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    if (await isSessionOrganizationRestricted(sessionToken)) {
      return withHeaders(
        NextResponse.json(
          { error: "Abonnement restreint (échec de paiement) — régularisez votre facturation pour reprendre les actions d'écriture." },
          { status: 402 }
        )
      );
    }
  }

  return withHeaders(NextResponse.next(requestInit));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
