import "server-only";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "./types";

/**
 * Fournisseur par défaut (`LLM_PROVIDER=demo`, comme `AI_PROVIDER=demo`
 * pour la couche IA existante de Provence 360) — déterministe, sans appel
 * réseau. Ne "comprend" pas le contenu : il reflète la structure attendue
 * (dernier message utilisateur) de façon prévisible, suffisant pour tester
 * le moteur de génération/prompts de bout en bout sans dépendre d'un
 * fournisseur réel.
 */
export class DemoLlmProvider implements LlmProvider {
  readonly key = "demo";
  readonly defaultModel = "demo-1";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const text = `[réponse de démonstration]\n${lastUser?.content ?? ""}`.trim();

    return {
      text,
      provider: this.key,
      model: request.model ?? this.defaultModel,
      promptTokens: request.messages.reduce((sum, m) => sum + m.content.length, 0),
      completionTokens: text.length,
    };
  }
}
