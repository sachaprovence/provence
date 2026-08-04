import type { NextConfig } from "next";

/**
 * En-têtes de sécurité HTTP (v1.2, AR-0169) — appliqués à TOUTES les
 * réponses (pages ET routes API), y compris les ressources statiques :
 * `next.config.ts#headers()` est traité par Next.js en amont du routage
 * applicatif, contrairement à `src/proxy.ts` qui ne s'exécute que sur les
 * requêtes traitées par le matcher du proxy.
 *
 * Volontairement SANS `Content-Security-Policy` : une CSP stricte sur une
 * application aussi large (pages, éditeur de workflow drag-drop, visites
 * 3D, PDF, éventuels scripts inline nécessaires à l'hydratation React)
 * exige un câblage par nonce vérifié page par page pour ne rien casser —
 * hors périmètre de cette passe de durcissement sans régression visuelle
 * documentée. Voir ADR 0045 pour la justification complète et le travail
 * futur explicitement identifié.
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
