/**
 * Contexte de variables résolu pour une exécution de workflow (voir
 * ADR 0019). Chaque portée demandée dans le brief v0.6 est un champ direct
 * de cet objet, ce qui permet à `getPath` de rester un simple accesseur de
 * chemin générique : `"results.node1.score"` traverse
 * `ctx.results.node1.score` sans code spécifique par portée.
 */
export type VariableContext = {
  workflow: Record<string, unknown>;
  context: Record<string, unknown>;
  user: Record<string, unknown> | null;
  organization: Record<string, unknown>;
  workspace: Record<string, unknown>;
  agents: Record<string, unknown>;
  results: Record<string, unknown>;
  api: Record<string, unknown>;
  form: Record<string, unknown>;
  permissions: string[];
};

export function createEmptyVariableContext(base: {
  organizationId: string;
  workspaceId: string;
  permissions?: string[];
}): VariableContext {
  return {
    workflow: {},
    context: {},
    user: null,
    organization: { id: base.organizationId },
    workspace: { id: base.workspaceId },
    agents: {},
    results: {},
    api: {},
    form: {},
    permissions: base.permissions ?? [],
  };
}

const INDEX_PATTERN = /^(.*)\[(\d+)\]$/;

/** Résout un chemin en pointillés (`"results.node1.score"`, `"context.items[0].id"`) sur un objet quelconque. */
export function getPath(root: unknown, path: string): unknown {
  if (!path) return root;
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    const indexMatch = part.match(INDEX_PATTERN);
    if (indexMatch) {
      const [, key, indexStr] = indexMatch;
      const container = key ? (current as Record<string, unknown>)[key] : current;
      current = Array.isArray(container) ? container[Number(indexStr)] : undefined;
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

/** Retourne une copie du contexte avec une valeur définie à un chemin de premier niveau (`"workflow.foo"`, `"results.node1"`). */
export function setPath(ctx: VariableContext, path: string, value: unknown): VariableContext {
  const [scope, ...rest] = path.split(".");
  if (!rest.length || !(scope in ctx)) {
    throw new Error(`Chemin de variable invalide : "${path}" (la portée doit être l'une de : workflow, context, results, form, api, agents).`);
  }
  const bucket = { ...(ctx[scope as keyof VariableContext] as Record<string, unknown>) };
  let cursor: Record<string, unknown> = bucket;
  for (let i = 0; i < rest.length - 1; i += 1) {
    const key = rest[i];
    cursor[key] = { ...(cursor[key] as Record<string, unknown> | undefined) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[rest[rest.length - 1]] = value;
  return { ...ctx, [scope]: bucket };
}
