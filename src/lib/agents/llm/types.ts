import "server-only";

/**
 * Abstraction générique de complétion LLM (v0.5) — délibérément distincte
 * de `src/lib/ai/` (l'`AIProvider` de Provence 360, orienté tâches
 * métier structurées comme `analyzeLead`/`generateMessage`). Cette
 * couche-ci est plus bas niveau ("envoyer des messages, recevoir du
 * texte") et appartient au Framework des Agents : n'importe quel agent
 * (pas seulement le Commercial) peut s'en servir sans jamais coder en dur
 * un fournisseur précis. Voir ADR 0015.
 */
export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = { role: LlmRole; content: string };

export type LlmCompletionRequest = {
  /** Modèle à utiliser ; si omis, le fournisseur applique `defaultModel`. */
  model?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type LlmCompletionResult = {
  text: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

/**
 * Implémentation d'un fournisseur LLM. Enregistrée une fois via
 * `registerLlmProvider` (`registry.ts`) — jamais instanciée directement
 * par un outil/agent. Un fournisseur réel (OpenAI, Anthropic, ...) ne
 * doit jamais lever au moment de l'enregistrement s'il n'est pas
 * configuré (pas de clé API) — seulement au moment de `complete()`, avec
 * un message d'erreur explicite (même principe que les outils
 * `notYetImplemented` du Framework, v0.3).
 */
export interface LlmProvider {
  readonly key: string;
  readonly defaultModel: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
