import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { LeadStage, PipelineStageCategory } from "@/generated/prisma/enums";
import { STAGE_LABEL, PIPELINE_STAGES } from "@/lib/labels";

/**
 * Personnalisation d'AFFICHAGE du pipeline commercial (brief v0.9 : "Le
 * pipeline doit être totalement personnalisable") — `PipelineStage` ne
 * change JAMAIS la sémantique métier d'une étape : `Lead.stage` (l'enum
 * `LeadStage`) reste l'unique source de vérité utilisée par le scoring, les
 * règles d'automatisation, le moteur de séquences et l'import CSV (voir
 * ADR 0038). Seuls le libellé, la couleur, l'ordre d'affichage et la
 * catégorie de reporting (OPEN/WON/LOST) sont personnalisables.
 */

const DEFAULT_CATEGORY: Record<LeadStage, PipelineStageCategory> = {
  NEW: PipelineStageCategory.OPEN,
  TO_ANALYZE: PipelineStageCategory.OPEN,
  QUALIFIED: PipelineStageCategory.OPEN,
  MESSAGE_TO_VALIDATE: PipelineStageCategory.OPEN,
  CONTACTED: PipelineStageCategory.OPEN,
  FOLLOW_UP_SCHEDULED: PipelineStageCategory.OPEN,
  REPLIED: PipelineStageCategory.OPEN,
  INTERESTED: PipelineStageCategory.OPEN,
  APPOINTMENT_SCHEDULED: PipelineStageCategory.OPEN,
  QUOTE_SENT: PipelineStageCategory.OPEN,
  NEGOTIATION: PipelineStageCategory.OPEN,
  WON: PipelineStageCategory.WON,
  LOST: PipelineStageCategory.LOST,
  TO_RECONTACT_LATER: PipelineStageCategory.OPEN,
  UNSUBSCRIBED: PipelineStageCategory.LOST,
};

const DEFAULT_COLOR: Record<LeadStage, string> = {
  NEW: "#9ca3af",
  TO_ANALYZE: "#9ca3af",
  QUALIFIED: "#7c6ff0",
  MESSAGE_TO_VALIDATE: "#e0a13d",
  CONTACTED: "#7c6ff0",
  FOLLOW_UP_SCHEDULED: "#7c6ff0",
  REPLIED: "#3b82f6",
  INTERESTED: "#22c55e",
  APPOINTMENT_SCHEDULED: "#22c55e",
  QUOTE_SENT: "#e0a13d",
  NEGOTIATION: "#e0a13d",
  WON: "#16a34a",
  LOST: "#ef4444",
  TO_RECONTACT_LATER: "#9ca3af",
  UNSUBSCRIBED: "#ef4444",
};

/** Ordre d'affichage par défaut du kanban — reprend l'ordre déjà utilisé aujourd'hui (`PIPELINE_STAGES`). */
export function buildDefaultPipelineStages(organizationId: string) {
  return PIPELINE_STAGES.map((stageKey, index) => ({
    organizationId,
    stageKey: stageKey as LeadStage,
    label: STAGE_LABEL[stageKey],
    color: DEFAULT_COLOR[stageKey as LeadStage],
    order: index,
    category: DEFAULT_CATEGORY[stageKey as LeadStage],
  }));
}

/**
 * Retourne les étapes de pipeline de l'organisation, triées par ordre
 * d'affichage — les seed paresseusement (idempotent, `createMany` avec
 * `skipDuplicates`) si l'organisation n'en a encore aucune, pour couvrir à
 * la fois les nouvelles organisations (déjà seedées par `bootstrapOrganization`)
 * et celles créées avant cette migration.
 */
export async function getPipelineStages(organizationId: string) {
  const existing = await prisma.pipelineStage.findMany({ where: { organizationId }, orderBy: { order: "asc" } });
  if (existing.length > 0) return existing;

  await prisma.pipelineStage.createMany({ data: buildDefaultPipelineStages(organizationId), skipDuplicates: true });
  return prisma.pipelineStage.findMany({ where: { organizationId }, orderBy: { order: "asc" } });
}

export async function updatePipelineStage(
  organizationId: string,
  stageKey: LeadStage,
  data: { label?: string; color?: string; category?: PipelineStageCategory }
) {
  await getPipelineStages(organizationId); // s'assure que la ligne existe (seed paresseux).
  const existing = await prisma.pipelineStage.findUnique({ where: { organizationId_stageKey: { organizationId, stageKey } } });
  if (!existing) throw new NotFoundError("Étape de pipeline introuvable.");

  return prisma.pipelineStage.update({
    where: { organizationId_stageKey: { organizationId, stageKey } },
    data: { label: data.label, color: data.color, category: data.category },
  });
}

/** Réordonne les étapes : `orderedStageKeys` doit contenir exactement les 15 valeurs de `LeadStage`. */
export async function reorderPipelineStages(organizationId: string, orderedStageKeys: LeadStage[]) {
  await getPipelineStages(organizationId);

  const allStages = Object.values(LeadStage);
  if (orderedStageKeys.length !== allStages.length || new Set(orderedStageKeys).size !== allStages.length) {
    throw new ValidationError("La liste doit contenir chaque étape du pipeline exactement une fois.");
  }

  await prisma.$transaction(
    orderedStageKeys.map((stageKey, index) =>
      prisma.pipelineStage.update({
        where: { organizationId_stageKey: { organizationId, stageKey } },
        data: { order: index },
      })
    )
  );

  return prisma.pipelineStage.findMany({ where: { organizationId }, orderBy: { order: "asc" } });
}
