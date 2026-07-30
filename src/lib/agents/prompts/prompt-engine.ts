import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { PromptTemplate } from "@/generated/prisma/client";

/**
 * Moteur de prompts (v0.5, étendu v0.7 — voir ADR 0028) : chaque prompt
 * est versionné (`PromptTemplate`, `@@unique([key, version, locale])`),
 * modifiable sans redéploiement (nouvelle version en base, jamais une
 * constante TypeScript), documenté (`description`), séparé du code,
 * réutilisable (référencé par `key` depuis n'importe quel outil d'agent).
 * v0.7 ajoute : multilingue (`locale`, repli sur "fr" si la langue
 * demandée n'a pas de version active), typé (`variableSchema`, validé
 * avant rendu), héritable (`parentKey`, chaîne de variables fusionnées et
 * substitution `{{parent}}` optionnelle). Un seul moteur, jamais dupliqué
 * pour le Knowledge/Context Engine — voir ADR 0028.
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const DEFAULT_LOCALE = "fr";
const MAX_INHERITANCE_DEPTH = 5;

export type PromptVariableType = "string" | "number" | "boolean";
export type PromptVariableSchema = Record<string, { type: PromptVariableType; required?: boolean; description?: string }>;

export async function createPromptVersion(params: {
  key: string;
  name: string;
  description?: string;
  category: string;
  template: string;
  variables?: string[];
  variableSchema?: PromptVariableSchema;
  parentKey?: string;
  locale?: string;
  createdById?: string;
  activate?: boolean;
}) {
  const locale = params.locale ?? DEFAULT_LOCALE;
  const last = await prisma.promptTemplate.findFirst({
    where: { key: params.key, locale },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const activate = params.activate ?? true;

  return prisma.$transaction(async (tx) => {
    if (activate) {
      await tx.promptTemplate.updateMany({ where: { key: params.key, locale, isActive: true }, data: { isActive: false } });
    }

    return tx.promptTemplate.create({
      data: {
        key: params.key,
        version: nextVersion,
        locale,
        parentKey: params.parentKey,
        name: params.name,
        description: params.description,
        category: params.category,
        template: params.template,
        variables: params.variables ?? [],
        variableSchema: (params.variableSchema ?? null) as never,
        isActive: activate,
        createdById: params.createdById,
      },
    });
  });
}

export async function activatePromptVersion(key: string, version: number, locale: string = DEFAULT_LOCALE) {
  const target = await prisma.promptTemplate.findUnique({ where: { key_version_locale: { key, version, locale } } });
  if (!target) throw new NotFoundError(`Version ${version} du prompt "${key}" (${locale}) introuvable.`);

  return prisma.$transaction(async (tx) => {
    await tx.promptTemplate.updateMany({ where: { key, locale, isActive: true }, data: { isActive: false } });
    return tx.promptTemplate.update({ where: { id: target.id }, data: { isActive: true } });
  });
}

/** Résout la version active pour la langue demandée, avec repli sur `"fr"` si absente — jamais un échec silencieux, jamais un mélange de langues non signalé. */
export async function getActivePrompt(key: string, locale: string = DEFAULT_LOCALE) {
  const exact = await prisma.promptTemplate.findFirst({ where: { key, locale, isActive: true } });
  if (exact) return exact;

  if (locale !== DEFAULT_LOCALE) {
    const fallback = await prisma.promptTemplate.findFirst({ where: { key, locale: DEFAULT_LOCALE, isActive: true } });
    if (fallback) return fallback;
  }

  throw new NotFoundError(`Aucun prompt actif pour la clé "${key}" (langue "${locale}" ni repli "${DEFAULT_LOCALE}").`);
}

export async function listPromptVersions(key: string, locale?: string) {
  return prisma.promptTemplate.findMany({ where: { key, locale }, orderBy: [{ locale: "asc" }, { version: "desc" }] });
}

/** Remonte la chaîne d'héritage (`parentKey`), fusionne les variables déclarées (l'enfant l'emporte sur le parent en cas de collision) — borné pour exclure trivialement un cycle. */
async function resolvePromptChain(prompt: PromptTemplate) {
  const chain: PromptTemplate[] = [prompt];
  let current = prompt;
  const seen = new Set([prompt.key]);

  for (let depth = 0; depth < MAX_INHERITANCE_DEPTH && current.parentKey; depth += 1) {
    if (seen.has(current.parentKey)) {
      throw new ValidationError(`Cycle d'héritage de prompt détecté sur la clé "${current.parentKey}".`);
    }
    const parent = await getActivePrompt(current.parentKey, current.locale);
    chain.push(parent);
    seen.add(parent.key);
    current = parent;
  }

  return chain;
}

function mergedVariableSchema(chain: { variableSchema: unknown }[]): PromptVariableSchema {
  let merged: PromptVariableSchema = {};
  for (const node of [...chain].reverse()) {
    if (node.variableSchema) merged = { ...merged, ...(node.variableSchema as PromptVariableSchema) };
  }
  return merged;
}

function mergedVariableNames(chain: { variables: string[] }[]): string[] {
  return Array.from(new Set(chain.flatMap((node) => node.variables)));
}

/** Valide les valeurs fournies contre le schéma typé déclaré (`variableSchema`) — lève une erreur explicite sur un type incorrect, jamais une coercion silencieuse. */
export function validatePromptVariables(schema: PromptVariableSchema, variables: Record<string, unknown>): void {
  for (const [name, spec] of Object.entries(schema)) {
    const value = variables[name];
    if (value === undefined) {
      if (spec.required) throw new ValidationError(`Variable requise manquante : "${name}".`);
      continue;
    }
    const actualType = typeof value;
    if (actualType !== spec.type) {
      throw new ValidationError(`Variable "${name}" doit être de type "${spec.type}" (reçu "${actualType}").`);
    }
  }
}

/** Substitution pure `{{ var }}` — extraite pour être testable sans base de données. */
export function renderTemplateString(template: string, variables: Record<string, unknown>): string {
  return template.replace(VARIABLE_PATTERN, (match, name: string) =>
    name in variables ? String(variables[name]) : match
  );
}

/**
 * Charge la version active d'un prompt (avec repli de langue), résout sa
 * chaîne d'héritage, valide les variables contre le schéma typé fusionné,
 * refuse explicitement (`ValidationError`) toute variable déclarée mais
 * non fournie, puis rend le texte — en substituant d'abord `{{parent}}`
 * par le rendu du parent si le template en fait usage.
 */
export async function renderPrompt(
  key: string,
  variables: Record<string, unknown>,
  locale: string = DEFAULT_LOCALE
): Promise<{ text: string; promptId: string; version: number; locale: string }> {
  const prompt = await getActivePrompt(key, locale);
  const chain = await resolvePromptChain(prompt);

  const declaredVariables = mergedVariableNames(chain);
  const missing = declaredVariables.filter((name) => !(name in variables));
  if (missing.length > 0) {
    throw new ValidationError(`Variables manquantes pour le prompt "${key}" : ${missing.join(", ")}.`);
  }

  const schema = mergedVariableSchema(chain);
  validatePromptVariables(schema, variables);

  let text = renderTemplateString(prompt.template, variables);
  if (text.includes("{{parent}}") && chain.length > 1) {
    const parent = chain[1];
    const parentText = renderTemplateString(parent.template, variables);
    text = text.replace(/\{\{parent\}\}/g, parentText);
  }

  return { text, promptId: prompt.id, version: prompt.version, locale: prompt.locale };
}
