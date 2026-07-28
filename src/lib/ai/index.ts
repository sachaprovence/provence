import type { AIProvider } from "./types";
import { DemoAIProvider } from "./demo-provider";

/**
 * Point d'entrée unique de la couche IA. Pour brancher un vrai fournisseur
 * (OpenAI, Anthropic, etc.) : implémenter l'interface `AIProvider` dans un
 * nouveau fichier (ex. `openai-provider.ts`), puis ajouter un cas ici piloté
 * par la variable d'environnement `AI_PROVIDER`. La clé API ne doit jamais
 * quitter le serveur (ne pas l'exposer via `NEXT_PUBLIC_*`).
 */
export function getAIProvider(): AIProvider {
  const kind = process.env.AI_PROVIDER ?? "demo";
  switch (kind) {
    case "demo":
    default:
      return new DemoAIProvider();
  }
}

export * from "./types";
