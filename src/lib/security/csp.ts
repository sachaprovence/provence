/**
 * Content-Security-Policy stricte à base de nonce (v1.3, AR-0173) —
 * v1.2 (ADR 0045) l'avait délibérément différée : câbler une CSP par nonce
 * sans casser l'hydratation React exige une vérification page par page.
 * Cette vérification, refaite contre les 4 suites E2E (v1.3, validation
 * finale), a trouvé plusieurs composants avec des styles inline à valeur
 * dynamique (`style={{ backgroundColor: tag.color }}` — couleurs de tags/
 * étapes issues de la base, jamais des constantes) : un CSP par nonce/hash
 * sur `style-src` ne peut PAS couvrir un attribut `style="..."` (seul
 * `'unsafe-hashes'` le permettrait, et seulement pour un ensemble FIXE de
 * valeurs — inapplicable ici puisque la valeur change avec les données).
 * `script-src` reste strict (nonce + `strict-dynamic`, la protection XSS à
 * plus fort impact) ; `style-src` accepte `'unsafe-inline'` en production,
 * un compromis courant et documenté (l'injection CSS a un impact bien
 * moindre qu'une injection JS).
 *
 * Générée par requête dans `src/proxy.ts` (jamais dans `next.config.ts`,
 * qui ne peut renvoyer qu'une valeur statique) — Next.js extrait le nonce
 * de cet en-tête pendant le rendu et l'applique automatiquement aux scripts
 * qu'il injecte lui-même (runtime React, chunks de page).
 */
export function buildCspHeader(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' sans nonce : les navigateurs l'ignorent en présence d'un nonce/hash sur la
    // même directive, donc ce dernier est délibérément absent ici (voir le commentaire ci-dessus).
    "style-src 'self' 'unsafe-inline'",
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
