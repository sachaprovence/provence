import "server-only";

/** Lève une erreur explicite et actionnable — jamais un échec silencieux — quand une variable d'environnement requise est absente. */
export function requireEnv(name: string, providerLabel: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Fournisseur ${providerLabel} non configuré : définissez la variable d'environnement ${name}.`);
  }
  return value;
}

type AnthropicMessagesResponse = {
  model: string;
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/**
 * Appel direct à l'API Messages d'Anthropic (https://docs.anthropic.com/en/api/messages).
 * `baseUrl` permet de cibler un serveur de test local (voir
 * `tests/ai/anthropic-provider.test.ts`) — jamais utilisé en production,
 * où l'URL réelle d'Anthropic est toujours utilisée.
 */
export async function callAnthropic(params: {
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  baseUrl?: string;
}): Promise<string> {
  const url = `${params.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      system: params.system,
      messages: [{ role: "user", content: params.prompt }],
      max_tokens: params.maxTokens ?? 1024,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Appel Anthropic échoué (${response.status} ${response.statusText}) : ${errorBody.slice(0, 500)}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const text = data.content.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("Réponse Anthropic sans contenu texte exploitable.");
  }
  return text;
}

/**
 * Extrait et parse un objet JSON depuis une réponse texte de Claude (qui peut
 * l'entourer d'un bloc ```json``` ou de texte libre malgré la consigne).
 * Échec explicite si non extractible/parsable — jamais un objet partiel
 * fabriqué silencieusement.
 */
export function parseJsonResponse<T>(text: string, context: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Réponse Anthropic non structurée pour "${context}" : impossible d'extraire un objet JSON.`);
  }
  try {
    return JSON.parse(match[0]) as T;
  } catch (cause) {
    throw new Error(`Réponse Anthropic invalide (JSON non parsable) pour "${context}".`, { cause: cause as Error });
  }
}
