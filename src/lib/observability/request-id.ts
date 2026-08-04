/**
 * Identifiant de corrélation par requête HTTP (v1.2, AR-0168) — généré une
 * fois par `src/proxy.ts` (exécuté sur CHAQUE requête), transmis à la fois
 * au gestionnaire de route (via l'en-tête de requête, mécanisme Next.js
 * standard `NextResponse.next({ request: { headers } })`) et au client
 * (en-tête de réponse, pour qu'un ticket de support puisse être relié à
 * une ligne de log précise). Respecte un identifiant déjà posé par un
 * proxy amont de confiance (répartiteur de charge, passerelle) plutôt que
 * d'en générer systématiquement un nouveau — évite de casser une
 * corrélation de bout en bout déjà en place en amont d'Autorun.
 */
export const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(inboundHeaderValue: string | null): string {
  if (inboundHeaderValue && inboundHeaderValue.length > 0 && inboundHeaderValue.length <= 200) {
    return inboundHeaderValue;
  }
  return crypto.randomUUID();
}

/** Lit l'identifiant de requête posé par le proxy sur une `Request`/`NextRequest` reçue par un gestionnaire de route. */
export function getRequestId(request: Request): string | null {
  return request.headers.get(REQUEST_ID_HEADER);
}
