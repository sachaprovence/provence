/**
 * Content-Security-Policy stricte à base de nonce (v1.3, AR-0173) —
 * v1.2 (ADR 0045) l'avait délibérément différée : câbler une CSP par nonce
 * sans casser l'hydratation React exige une vérification page par page.
 * Cette vérification a depuis été faite (voir ADR v1.3) : l'application ne
 * charge aucun script/style externe, aucune iframe, aucun `eval` en
 * production — un seul `<script>` inline (`src/app/layout.tsx`, init du
 * thème), déjà migré pour recevoir le nonce.
 *
 * Générée par requête dans `src/proxy.ts` (jamais dans `next.config.ts`,
 * qui ne peut renvoyer qu'une valeur statique) — Next.js extrait le nonce
 * de cet en-tête pendant le rendu et l'applique automatiquement aux scripts/
 * styles qu'il injecte lui-même (runtime React, chunks de page).
 */
export function buildCspHeader(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Développement (Fast Refresh/Turbopack) injecte des styles sans nonce — sans conséquence en
    // production (seul chemin exposé à un attaquant), où le nonce reste requis.
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
