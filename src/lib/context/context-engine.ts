import "server-only";
import { logger } from "@/lib/logger";
import { getActiveLlmProvider } from "@/lib/agents/llm";
import { listMemoryEntries } from "@/lib/memory/memory-engine";
import { searchKnowledge } from "@/lib/knowledge/search";
import { MemoryScopeType, MemoryKind } from "@/generated/prisma/enums";
import type { ContextRequest, ContextSection, AssembledContext, ContextSectionKind } from "./types";

/**
 * Context Engine (v0.7) : seul point d'entrée pour assembler le contexte
 * d'un appel IA. Indépendant du fournisseur IA (aucun appel réseau tant
 * que le contenu assemblé tient dans le budget demandé — la compression
 * seule réutilise le moteur LLM générique, v0.5, jamais un second moteur
 * de génération). Détermine automatiquement, par ordre de priorité :
 * contraintes métier fournies par l'appelant, préférences (Memory Engine,
 * niveau utilisateur), documents utiles (Knowledge Engine, recherche
 * hybride multi-sources — couvre CRM/devis/conversations/emails/
 * workflows/logs/décisions/documentation en un seul appel puisque ce sont
 * tous des `KnowledgeSourceType`), décisions passées (Memory Engine,
 * niveau organisation), résultats précédents (Memory Engine, niveau
 * tâche) et historique de conversation (Memory Engine, niveau
 * conversation). "Par permissions"/"par organisation"/"par workspace" :
 * chaque source consultée est déjà strictement scopée par
 * `organizationId`/`workspaceId` (Knowledge Engine, Memory Engine) —
 * l'autorisation d'appeler le Context Engine du tout reste la
 * responsabilité de l'appelant (route API), même convention que le reste
 * du projet (voir ADR 0026).
 */

const SECTION_PRIORITY: Record<ContextSectionKind, number> = {
  constraint: 0,
  preference: 1,
  "agent-memory": 2,
  document: 3,
  decision: 4,
  "previous-result": 5,
  history: 6,
};

const DEFAULT_MAX_DOCUMENTS = 8;
const DEFAULT_MAX_TOKENS = 2000;
const CHARS_PER_TOKEN = 4; // heuristique déjà utilisée pour l'estimation de coût des embeddings, voir embedding-service.ts
const MAX_COMPRESSION_INPUT_CHARS = 12000;
const MAX_HISTORY_ENTRIES = 10;
const MAX_DECISION_ENTRIES = 5;

function memoryValueToText(entry: { value: unknown; summary: string | null }): string {
  if (entry.summary) return entry.summary;
  return typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
}

async function collectDocumentSections(request: ContextRequest): Promise<ContextSection[]> {
  const matches = await searchKnowledge(
    request.query,
    { organizationId: request.organizationId, workspaceId: request.workspaceId, sourceTypes: request.sourceTypes },
    { mode: "hybrid", limit: request.maxDocuments ?? DEFAULT_MAX_DOCUMENTS }
  );
  return matches.map((match) => ({
    kind: "document" as const,
    label: `Document — ${match.documentTitle} (${match.sourceType})`,
    content: match.content,
    score: match.score,
  }));
}

async function collectPreferenceSections(request: ContextRequest): Promise<ContextSection[]> {
  if (!request.userScopeId) return [];
  const prefs = await listMemoryEntries({
    organizationId: request.organizationId,
    scopeType: MemoryScopeType.USER,
    scopeId: request.userScopeId,
    kind: MemoryKind.PREFERENCE,
  });
  return prefs.map((p) => ({ kind: "preference" as const, label: `Préférence — ${p.key}`, content: memoryValueToText(p) }));
}

async function collectAgentMemorySections(request: ContextRequest): Promise<ContextSection[]> {
  if (!request.agentScopeId) return [];
  const entries = await listMemoryEntries({
    organizationId: request.organizationId,
    scopeType: MemoryScopeType.AGENT,
    scopeId: request.agentScopeId,
  });
  return entries.map((e) => ({ kind: "agent-memory" as const, label: `Mémoire agent — ${e.key}`, content: memoryValueToText(e) }));
}

async function collectHistorySections(request: ContextRequest): Promise<ContextSection[]> {
  if (!request.conversationScopeId) return [];
  const history = await listMemoryEntries({
    organizationId: request.organizationId,
    scopeType: MemoryScopeType.CONVERSATION,
    scopeId: request.conversationScopeId,
  });
  return history
    .slice(0, MAX_HISTORY_ENTRIES)
    .map((h) => ({ kind: "history" as const, label: `Historique conversation — ${h.key}`, content: memoryValueToText(h) }));
}

async function collectPreviousResultSections(request: ContextRequest): Promise<ContextSection[]> {
  if (!request.taskScopeId) return [];
  const results = await listMemoryEntries({
    organizationId: request.organizationId,
    scopeType: MemoryScopeType.TASK,
    scopeId: request.taskScopeId,
  });
  return results.map((r) => ({ kind: "previous-result" as const, label: `Résultat précédent — ${r.key}`, content: memoryValueToText(r) }));
}

async function collectDecisionSections(request: ContextRequest): Promise<ContextSection[]> {
  const decisions = await listMemoryEntries({
    organizationId: request.organizationId,
    scopeType: MemoryScopeType.ORGANIZATION,
    scopeId: request.organizationId,
    kind: MemoryKind.DECISION,
  });
  return decisions
    .slice(0, MAX_DECISION_ENTRIES)
    .map((d) => ({ kind: "decision" as const, label: `Décision — ${d.key}`, content: memoryValueToText(d) }));
}

function collectConstraintSections(request: ContextRequest): ContextSection[] {
  return (request.businessConstraints ?? []).map((constraint, index) => ({
    kind: "constraint" as const,
    label: `Contrainte métier ${index + 1}`,
    content: constraint,
  }));
}

/** Classe les sections par priorité (contraintes puis préférences puis documents...), en conservant l'ordre relatif au sein d'une même priorité (tri stable, un score de recherche plus élevé reste avant un score plus faible pour les documents). */
function orderSections(sections: ContextSection[]): ContextSection[] {
  return [...sections].sort((a, b) => {
    const priorityDiff = SECTION_PRIORITY[a.kind] - SECTION_PRIORITY[b.kind];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function renderSections(sections: ContextSection[]): string {
  return sections.map((s) => `## ${s.label}\n${s.content}`).join("\n\n");
}

/**
 * Compresse le texte assemblé s'il dépasse le budget demandé. Stratégie en
 * deux temps : d'abord un troncage simple par ordre de priorité croissante
 * (on retire d'abord les sections les moins prioritaires en entier plutôt
 * que de couper au milieu de chacune) ; si le résultat reste au-dessus du
 * budget une fois réduit aux sections prioritaires seules, un résumé fidèle
 * est produit par le moteur LLM générique (réutilisé, jamais dupliqué —
 * même principe que `compressMemoryEntry`, v0.7 Memory Engine).
 */
async function compressToBudget(sections: ContextSection[], maxChars: number): Promise<{ text: string; compressed: boolean }> {
  const full = renderSections(sections);
  if (full.length <= maxChars) return { text: full, compressed: false };

  const kept: ContextSection[] = [];
  let runningLength = 0;
  for (const section of sections) {
    const candidateLength = runningLength + section.content.length + section.label.length + 4;
    if (candidateLength > maxChars && kept.length > 0) break;
    kept.push(section);
    runningLength = candidateLength;
  }
  const truncated = renderSections(kept);
  if (truncated.length <= maxChars) return { text: truncated, compressed: kept.length < sections.length };

  const provider = getActiveLlmProvider();
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content:
          "Compresse le contexte suivant en un texte plus court, en conservant fidèlement les faits, contraintes et décisions essentielles. Respecte un budget de longueur strict.",
      },
      { role: "user", content: full.slice(0, MAX_COMPRESSION_INPUT_CHARS) },
    ],
  });
  return { text: result.text, compressed: true };
}

export async function assembleContext(request: ContextRequest): Promise<AssembledContext> {
  const maxChars = (request.maxTokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN;

  const [documentSections, preferenceSections, agentMemorySections, historySections, previousResultSections, decisionSections] =
    await Promise.all([
      collectDocumentSections(request),
      collectPreferenceSections(request),
      collectAgentMemorySections(request),
      collectHistorySections(request),
      collectPreviousResultSections(request),
      collectDecisionSections(request),
    ]);
  const constraintSections = collectConstraintSections(request);

  const sections = orderSections([
    ...constraintSections,
    ...preferenceSections,
    ...agentMemorySections,
    ...documentSections,
    ...decisionSections,
    ...previousResultSections,
    ...historySections,
  ]);

  const { text, compressed } = await compressToBudget(sections, maxChars);

  logger.debug(
    {
      module: "context-engine",
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      sectionCounts: sections.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }), {}),
      compressed,
      tokenEstimate: Math.ceil(text.length / CHARS_PER_TOKEN),
    },
    "Contexte assemblé."
  );

  return { sections, text, compressed, tokenEstimate: Math.ceil(text.length / CHARS_PER_TOKEN) };
}

export * from "./types";
