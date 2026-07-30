import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "../types";

type GoogleGenerateContentResponse = {
  candidates: { content: { parts: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/** https://ai.google.dev/api/generate-content — nécessite GOOGLE_API_KEY. */
export class GoogleProvider implements LlmProvider {
  readonly key = "google";
  readonly defaultModel = "gemini-1.5-flash";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("GOOGLE_API_KEY", "Google");
    const model = request.model ?? this.defaultModel;

    // L'API Gemini n'a pas de rôle "system" dédié dans `contents` — les
    // messages système sont préfixés au premier tour utilisateur.
    const systemText = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = request.messages.filter((m) => m.role !== "system");

    const data = await postJson<GoogleGenerateContentResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: turns.map((m, index) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: index === 0 && systemText ? `${systemText}\n\n${m.content}` : m.content }],
        })),
        generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens },
      },
      {}
    );

    return {
      text: data.candidates[0]?.content.parts.map((p) => p.text ?? "").join("") ?? "",
      provider: this.key,
      model,
      promptTokens: data.usageMetadata?.promptTokenCount,
      completionTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }
}
