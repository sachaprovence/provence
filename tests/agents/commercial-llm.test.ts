import { describe, expect, it, beforeAll } from "vitest";
import { registerBuiltInLlmProviders, getActiveLlmProvider } from "@/lib/agents/llm";
import { registerLlmProvider, getLlmProvider, listRegisteredLlmProviderKeys } from "@/lib/agents/llm/registry";
import type { LlmProvider } from "@/lib/agents/llm/types";

/**
 * Registre et fournisseur de démonstration du moteur de génération (v0.5) —
 * pas besoin de base de données. Vérifie que les 7 fournisseurs réels
 * (OpenAI/Anthropic/Google/Mistral/OpenRouter/Azure/Ollama) sont bien
 * enregistrés (déclarés) sans qu'aucun ne soit câblé en dur comme "le"
 * fournisseur — voir ADR 0015.
 */
describe("registre de fournisseurs LLM", () => {
  beforeAll(() => {
    registerBuiltInLlmProviders();
  });

  it("enregistre le fournisseur de démonstration et les 7 fournisseurs réels prévus", () => {
    const keys = listRegisteredLlmProviderKeys();
    for (const expected of ["demo", "openai", "anthropic", "google", "mistral", "openrouter", "azure", "ollama"]) {
      expect(keys).toContain(expected);
    }
  });

  it("le fournisseur de démonstration est déterministe et ne fait aucun appel réseau", async () => {
    const provider = getLlmProvider("demo")!;
    const result = await provider.complete({ messages: [{ role: "user", content: "Bonjour" }] });
    expect(result.text).toContain("Bonjour");
    expect(result.provider).toBe("demo");
  });

  it("un fournisseur réel non configuré lève une erreur explicite au moment de l'appel, pas à l'enregistrement", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const provider = getLlmProvider("openai")!;
      expect(provider).toBeDefined(); // l'enregistrement seul n'échoue jamais
      await expect(provider.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/OPENAI_API_KEY/);
    } finally {
      if (previous) process.env.OPENAI_API_KEY = previous;
    }
  });

  it("getActiveLlmProvider est piloté par LLM_PROVIDER, jamais un fournisseur choisi en dur", () => {
    const previous = process.env.LLM_PROVIDER;
    try {
      delete process.env.LLM_PROVIDER;
      expect(getActiveLlmProvider().key).toBe("demo");

      process.env.LLM_PROVIDER = "ollama";
      expect(getActiveLlmProvider().key).toBe("ollama");
    } finally {
      if (previous) process.env.LLM_PROVIDER = previous;
      else delete process.env.LLM_PROVIDER;
    }
  });

  it("le registre reste extensible : un nouveau fournisseur peut être ajouté sans toucher aux fournisseurs existants", () => {
    const customProvider: LlmProvider = {
      key: "test-custom-llm",
      defaultModel: "test-model",
      async complete() {
        return { text: "ok", provider: "test-custom-llm", model: "test-model" };
      },
    };
    registerLlmProvider(customProvider);
    expect(getLlmProvider("test-custom-llm")).toBe(customProvider);
  });
});
