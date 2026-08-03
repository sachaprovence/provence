import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { isRateLimited } from "@/lib/security/rate-limiter";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "POST" && RATE_LIMITED_AUTH_PATHS.has(pathname)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`${pathname}:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
    }
  }

  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
