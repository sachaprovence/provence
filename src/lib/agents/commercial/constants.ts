/** Clé de runtime partagée entre `commercial-service.ts` et `definitions/commercial-agent.ts` (évite un import circulaire entre les deux). */
export const COMMERCIAL_AGENT_RUNTIME_KEY = "commercial.sales-agent";
