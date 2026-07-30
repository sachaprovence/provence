import "server-only";

/** Lève une erreur explicite et actionnable — jamais un échec silencieux — quand une variable d'environnement requise est absente. */
export function requireEnv(name: string, providerLabel: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Fournisseur ${providerLabel} non configuré : définissez la variable d'environnement ${name}.`);
  }
  return value;
}

/** Appel HTTP JSON générique avec message d'erreur explicite en cas d'échec — partagé par tous les adaptateurs de fournisseur. */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Appel LLM échoué (${response.status} ${response.statusText}) : ${errorBody.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}
