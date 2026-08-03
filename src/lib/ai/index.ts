import type { AIProvider } from "./types";
import { DemoAIProvider } from "./demo-provider";
import { AnthropicAIProvider } from "./providers/anthropic";

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

export * from "./types";
