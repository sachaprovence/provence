import "server-only";
import { registerLlmProvider, getLlmProvider, listRegisteredLlmProviderKeys } from "./registry";
import { DemoLlmProvider } from "./demo-provider";
import { OpenAiProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleProvider } from "./providers/google";
import { MistralProvider } from "./providers/mistral";
import { OpenRouterProvider } from "./providers/openrouter";
import { AzureOpenAiProvider } from "./providers/azure";
import { OllamaProvider } from "./providers/ollama";

let registered = false;

/**
 * Enregistre tous les fournisseurs LLM connus (idempotent, protégé par
 * `registered`). Appelé défensivement par `getActiveLlmProvider` à chaque
 * résolution plutôt qu'une seule fois au démarrage — un enregistrement qui
 * n'aurait lieu qu'au boot peut rester invisible du contexte d'exécution
 * qui traite réellement la requête (voir ADR 0013, même défaut déjà
 * rencontré et corrigé pour le registre d'agents).
 */
export function registerBuiltInLlmProviders() {
  if (registered) return;
  registered = true;

  registerLlmProvider(new DemoLlmProvider());
  registerLlmProvider(new OpenAiProvider());
  registerLlmProvider(new AnthropicProvider());
  registerLlmProvider(new GoogleProvider());
  registerLlmProvider(new MistralProvider());
  registerLlmProvider(new OpenRouterProvider());
  registerLlmProvider(new AzureOpenAiProvider());
  registerLlmProvider(new OllamaProvider());
}

/**
 * Fournisseur actif, piloté par la variable d'environnement `LLM_PROVIDER`
 * (défaut `"demo"`) — jamais un fournisseur choisi en dur dans le code
 * appelant (voir ADR 0015). Changer de fournisseur ne nécessite aucune
 * modification de code, seulement la variable d'environnement (et les
 * identifiants requis par ce fournisseur, voir chaque adaptateur sous
 * `providers/`).
 */
export function getActiveLlmProvider() {
  registerBuiltInLlmProviders();
  const key = process.env.LLM_PROVIDER ?? "demo";
  const provider = getLlmProvider(key);
  if (!provider) {
    throw new Error(
      `Fournisseur LLM "${key}" inconnu. Fournisseurs enregistrés : ${listRegisteredLlmProviderKeys().join(", ")}.`
    );
  }
  return provider;
}

export * from "./types";
export * from "./registry";
