import type { NextConfig } from "next";

/**
 * En-têtes de sécurité HTTP (v1.2, AR-0169) — appliqués à TOUTES les
 * réponses (pages ET routes API), y compris les ressources statiques :
 * `next.config.ts#headers()` est traité par Next.js en amont du routage
 * applicatif, contrairement à `src/proxy.ts` qui ne s'exécute que sur les
 * requêtes traitées par le matcher du proxy.
 *
 * `Content-Security-Policy` volontairement ABSENTE d'ici (v1.2, ADR 0045) :
 * elle est désormais posée par `src/proxy.ts` (v1.3, AR-0173,
 * `src/lib/security/csp.ts`), pas ici, car elle nécessite un nonce généré
 * PAR REQUÊTE — `headers()` ci-dessous ne peut renvoyer qu'une valeur
 * statique, connue une seule fois au build.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Retire l'en-tête `X-Powered-By: Next.js` (v1.2, AR-0169) — n'aide en
  // rien un opérateur légitime, mais renseigne gratuitement un attaquant
  // sur la pile technique exacte.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
