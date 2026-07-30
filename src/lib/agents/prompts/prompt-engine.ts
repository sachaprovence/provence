import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Moteur de prompts (v0.5) : chaque prompt est versionné (`PromptTemplate`,
 * `@@unique([key, version])`), modifiable sans redéploiement (nouvelle
 * version en base plutôt qu'une constante TypeScript), documenté
 * (`description`), séparé du code (le texte vit en base), et réutilisable
 * (référencé par `key` depuis n'importe quel outil d'agent). Générique —
 * n'appartient pas au Commercial en particulier. Voir ADR 0016.
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export async function createPromptVersion(params: {
  key: string;
  name: string;
  description?: string;
  category: string;
  template: string;
  variables?: string[];
  createdById?: string;
  activate?: boolean;
}) {
  const last = await prisma.promptTemplate.findFirst({
    where: { key: params.key },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const activate = params.activate ?? true;

  return prisma.$transaction(async (tx) => {
    if (activate) {
      await tx.promptTemplate.updateMany({ where: { key: params.key, isActive: true }, data: { isActive: false } });
    }

    return tx.promptTemplate.create({
      data: {
        key: params.key,
        version: nextVersion,
        name: params.name,
        description: params.description,
        category: params.category,
        template: params.template,
        variables: params.variables ?? [],
        isActive: activate,
        createdById: params.createdById,
      },
    });
  });
}

export async function activatePromptVersion(key: string, version: number) {
  const target = await prisma.promptTemplate.findUnique({ where: { key_version: { key, version } } });
  if (!target) throw new NotFoundError(`Version ${version} du prompt "${key}" introuvable.`);

  return prisma.$transaction(async (tx) => {
    await tx.promptTemplate.updateMany({ where: { key, isActive: true }, data: { isActive: false } });
    return tx.promptTemplate.update({ where: { id: target.id }, data: { isActive: true } });
  });
}

export async function getActivePrompt(key: string) {
  const prompt = await prisma.promptTemplate.findFirst({ where: { key, isActive: true } });
  if (!prompt) throw new NotFoundError(`Aucun prompt actif pour la clé "${key}".`);
  return prompt;
}

export async function listPromptVersions(key: string) {
  return prisma.promptTemplate.findMany({ where: { key }, orderBy: { version: "desc" } });
}

/**
 * Charge la version active d'un prompt et substitue ses variables
 * déclarées. Refuse explicitement (`ValidationError`) toute variable
 * déclarée mais non fournie — jamais un rendu partiel silencieux.
 * Les variables non déclarées présentes dans le texte mais non fournies
 * restent telles quelles (`{{var}}`) plutôt que de lever, pour rester
 * tolérant à un template qui référence une variable optionnelle.
 */
export async function renderPrompt(key: string, variables: Record<string, string>): Promise<{ text: string; promptId: string; version: number }> {
  const prompt = await getActivePrompt(key);

  const missing = prompt.variables.filter((name) => !(name in variables));
  if (missing.length > 0) {
    throw new ValidationError(`Variables manquantes pour le prompt "${key}" : ${missing.join(", ")}.`);
  }

  const text = prompt.template.replace(VARIABLE_PATTERN, (match, name: string) =>
    name in variables ? variables[name] : match
  );

  return { text, promptId: prompt.id, version: prompt.version };
}
