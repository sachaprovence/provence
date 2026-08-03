import "server-only";

export { requireEnv } from "@/lib/agents/llm/providers/http-helpers";

/** Appel HTTP JSON générique — partagé par les adaptateurs d'embeddings et de bases vectorielles (voir `providers/http-helpers.ts` pour l'équivalent LLM). */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Appel échoué (${response.status} ${response.statusText}) : ${errorBody.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

export async function deleteJson<T>(url: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Suppression échouée (${response.status} ${response.statusText}) : ${errorBody.slice(0, 500)}`);
  }

  return response.json().catch(() => undefined) as Promise<T>;
}
