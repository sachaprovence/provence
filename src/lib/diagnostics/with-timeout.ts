/**
 * Délai maximal générique pour un test de connexion de diagnostic (v1.2,
 * AR-0165) — contrairement à `s3-provider.ts` (qui utilise `AbortController`
 * pour annuler réellement la requête `fetch` sous-jacente), les appels OAuth
 * Gmail/Outlook (`refreshGoogleAccessToken`/`refreshMicrosoftAccessToken`) ne
 * relaient aucun signal d'annulation — cette fonction ne peut donc que
 * courir-contre (`Promise.race`) un délai plutôt qu'annuler l'appel réseau
 * sous-jacent. Suffisant pour un diagnostic déclenché manuellement (pas de
 * fuite de ressource critique, juste un appel réseau qui continue en
 * arrière-plan jusqu'à sa propre résolution).
 */
export class DiagnosticTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`Délai dépassé (${timeoutMs} ms) lors du test de connexion (${label}).`);
    this.name = "DiagnosticTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DiagnosticTimeoutError(label, timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 10_000;
