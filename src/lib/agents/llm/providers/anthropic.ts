import "server-only";
import { requireEnv, postJson } from "./http-helpers";
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult, LlmMessage } from "../types";

type AnthropicMessagesResponse = {
  model: string;
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** https://docs.anthropic.com/en/api/messages — nécessite ANTHROPIC_API_KEY. */
export class AnthropicProvider implements LlmProvider {
  readonly key = "anthropic";
  readonly defaultModel = "claude-sonnet-5";

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = requireEnv("ANTHROPIC_API_KEY", "Anthropic");
    const model = request.model ?? this.defaultModel;

    const systemMessages = request.messages.filter((m: LlmMessage) => m.role === "system").map((m) => m.content);
    const conversation = request.messages.filter((m: LlmMessage) => m.role !== "system");

    const data = await postJson<AnthropicMessagesResponse>(
      "https://api.anthropic.com/v1/messages",
      {
        model,
        system: systemMessages.join("\n\n") || undefined,
        messages: conversation.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature,
      },
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    );

    return {
      text: data.content.find((block) => block.type === "text")?.text ?? "",
      provider: this.key,
      model: data.model ?? model,
      promptTokens: data.usage?.input_tokens,
      completionTokens: data.usage?.output_tokens,
    };
  }
}
