import "server-only";
import { prisma } from "@/lib/prisma";
import { QuotaExceededError } from "@/lib/errors";

/**
 * Quota IA mensuel dur par organisation (v0.9 bis, AR-0051). `null` (défaut)
 * = pas de quota, comportement inchangé pour toutes les organisations
 * existantes (fonctionnalité strictement opt-in). Quand un quota est
 * configuré, il est vérifié AVANT tout nouvel appel IA réel — un
 * dépassement bloque explicitement l'appel (`QuotaExceededError`, jamais un
 * simple avertissement) — dans les deux couches IA de l'application :
 * `src/lib/ai/` (couche historique, voir `getAIProviderForOrganization`) et
 * le Framework des Agents (`generateAgentNarrative`, voir
 * `src/lib/agents/shared/generation.ts`).
 *
 * L'usage est mesuré en agrégeant `AIRequest.estimatedCostUsd` du mois civil
 * en cours pour l'organisation — cette table existe depuis v0.3 et est déjà
 * la source de vérité du coût IA (voir aussi `getAiCostMetrics`, AR-0049).
 */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getAiSpendThisMonthUsd(organizationId: string): Promise<number> {
  const result = await prisma.aIRequest.aggregate({
    where: { organizationId, createdAt: { gte: startOfCurrentMonth() } },
    _sum: { estimatedCostUsd: true },
  });
  return result._sum.estimatedCostUsd ?? 0;
}

/**
 * Lève `QuotaExceededError` si l'organisation a configuré un quota
 * (`aiMonthlyBudgetUsd`) et l'a déjà atteint ou dépassé ce mois-ci. Ne fait
 * rien (pas de quota = illimité) si le champ est `null`.
 */
export async function assertAiQuotaAvailable(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { aiMonthlyBudgetUsd: true },
  });
  if (!organization?.aiMonthlyBudgetUsd) return;

  const spent = await getAiSpendThisMonthUsd(organizationId);
  if (spent >= organization.aiMonthlyBudgetUsd) {
    throw new QuotaExceededError(
      `Quota IA mensuel dépassé pour cette organisation (${spent.toFixed(2)} $ / ${organization.aiMonthlyBudgetUsd.toFixed(2)} $).`,
      { spentUsd: spent, budgetUsd: organization.aiMonthlyBudgetUsd }
    );
  }
}

/**
 * Estimation générique du coût d'un appel IA à partir de longueurs de texte
 * (4 caractères ≈ 1 token, tarifs approximatifs ~3 $/M tokens en entrée et
 * ~15 $/M tokens en sortie) — utilisée pour journaliser le coût des appels
 * du Framework des Agents (`generateAgentNarrative`), qui peut passer par
 * n'importe lequel des fournisseurs LLM enregistrés (`LLM_PROVIDER`) : une
 * estimation par fournisseur précis n'est pas réalisable ici sans dupliquer
 * la logique de chaque adaptateur. Mêmes ordres de grandeur que
 * `AnthropicAIProvider.estimateCostUsd` (`src/lib/ai/providers/anthropic.ts`).
 */
export function estimateGenericAiCostUsd(promptChars: number, responseChars: number): number {
  const promptTokens = promptChars / 4;
  const responseTokens = responseChars / 4;
  const costUsd = (promptTokens / 1_000_000) * 3 + (responseTokens / 1_000_000) * 15;
  return Math.round(costUsd * 1e6) / 1e6;
}
