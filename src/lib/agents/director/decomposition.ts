import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { AgentInstallationStatus } from "@/generated/prisma/enums";
import type { AgentInstallation } from "@/generated/prisma/client";
import type { PlanStepInput } from "./planning-engine";

/**
 * Décomposition automatique d'un objectif en étapes (v0.4). **Ceci est une
 * heuristique de correspondance de mots-clés, pas une compréhension
 * réelle du langage naturel** — aucun modèle de langage n'est intégré à ce
 * stade (voir ADR 0011, dans la continuité de la décision v0.3 de ne pas
 * intégrer de fournisseur IA externe pour la mémoire). Elle choisit le
 * meilleur agent actif disponible dont la catégorie ou le nom apparaît dans
 * l'objectif, et produit un plan à une seule étape.
 *
 * Le point d'extension prévu pour une vraie décomposition (NLU/LLM) est
 * `directorRequestSchema.steps` (`src/lib/validations/director.ts`) : un
 * appelant qui fournit déjà des étapes structurées court-circuite
 * entièrement cette fonction — le moteur de planification et de
 * délégation, lui, ne change pas.
 */
export async function decomposeObjective(
  director: Pick<AgentInstallation, "id" | "workspaceId">,
  objective: string
): Promise<PlanStepInput[]> {
  const candidates = await prisma.agentInstallation.findMany({
    where: { workspaceId: director.workspaceId, status: AgentInstallationStatus.ACTIVE, id: { not: director.id } },
    include: { definition: true },
    orderBy: { installedAt: "asc" },
  });

  if (candidates.length === 0) {
    throw new ValidationError(
      "Aucun autre agent actif n'est installé dans ce workspace : le Director n'a rien à déléguer."
    );
  }

  const normalizedObjective = objective.toLowerCase();
  const byCategory = candidates.find((candidate) => normalizedObjective.includes(candidate.definition.category.toLowerCase()));
  const byName = candidates.find((candidate) => normalizedObjective.includes(candidate.definition.name.toLowerCase()));
  const chosen = byCategory ?? byName ?? candidates[0];

  return [
    {
      objective,
      targetInstallationId: chosen.id,
      priority: 0,
    },
  ];
}
