import type { AIProvider } from "./types";
import { DemoAIProvider } from "./demo-provider";
import { AnthropicAIProvider } from "./providers/anthropic";
import { assertAiQuotaAvailable } from "./quota";

/**
 * Point d'entrée unique de la couche IA, piloté par `AI_PROVIDER`. Pour
 * brancher un autre fournisseur réel (OpenAI, etc.) : implémenter l'interface
 * `AIProvider` dans `providers/`, puis ajouter un cas ici. La clé API ne doit
 * jamais quitter le serveur (ne pas l'exposer via `NEXT_PUBLIC_*`).
 */
export function getAIProvider(): AIProvider {
  const kind = process.env.AI_PROVIDER ?? "demo";
  switch (kind) {
    case "anthropic":
      return new AnthropicAIProvider();
    case "demo":
    default:
      return new DemoAIProvider();
  }
}

/**
 * Même chose que `getAIProvider()`, mais vérifie d'abord le quota IA mensuel
 * de l'organisation (AR-0051, `src/lib/ai/quota.ts`) — lève
 * `QuotaExceededError` si dépassé, jamais un appel IA silencieusement
 * facturé au-delà du budget configuré. À utiliser à chaque point d'appel
 * réel connaissant l'organisation concernée (routes API, `sequence-engine.ts`).
 */
export async function getAIProviderForOrganization(organizationId: string): Promise<AIProvider> {
  await assertAiQuotaAvailable(organizationId);
  return getAIProvider();
}

export * from "./types";
export { assertAiQuotaAvailable, getAiSpendThisMonthUsd } from "./quota";
