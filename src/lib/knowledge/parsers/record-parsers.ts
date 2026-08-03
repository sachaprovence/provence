import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { DocumentParser, ParseContext, ParseInput, ParsedDocument } from "./types";

/**
 * Parseurs de sources déjà présentes en base (pas des fichiers) : le
 * document indexable est une sérialisation textuelle de l'enregistrement.
 * Chaque lecture est STRICTEMENT scopée par `ctx.organizationId`/
 * `ctx.workspaceId` — jamais par `sourceRef` seul — pour ne jamais
 * pouvoir indexer, même par erreur de saisie, l'enregistrement d'une
 * autre organisation (voir ADR 0026).
 */
function requireSourceRef(input: ParseInput, sourceType: string): string {
  if (!input.sourceRef) throw new ValidationError(`La source "${sourceType}" nécessite "sourceRef".`);
  return input.sourceRef;
}

const crmParser: DocumentParser = {
  sourceType: KnowledgeSourceType.CRM,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "CRM");
    const prospect = await prisma.commercialProspect.findFirst({
      where: { id, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId },
    });
    if (!prospect) throw new NotFoundError("Prospect introuvable.");

    const lines = [
      `Entreprise : ${prospect.companyName}`,
      prospect.sector && `Secteur : ${prospect.sector}`,
      prospect.companySize && `Taille : ${prospect.companySize}`,
      prospect.website && `Site web : ${prospect.website}`,
      `Étape du pipeline : ${prospect.stage}`,
      prospect.score !== null && `Score : ${prospect.score}`,
      prospect.qualificationNotes && `Notes de qualification : ${prospect.qualificationNotes}`,
    ].filter(Boolean);

    return { title: input.title ?? `Prospect — ${prospect.companyName}`, content: lines.join("\n"), metadata: { prospectId: prospect.id } };
  },
};

const quoteParser: DocumentParser = {
  sourceType: KnowledgeSourceType.QUOTE,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "QUOTE");
    const quote = await prisma.quote.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { lines: true, lead: true },
    });
    if (!quote) throw new NotFoundError("Devis introuvable.");

    const lines = [
      `Devis ${quote.reference} — ${quote.lead.establishmentName}`,
      `Statut : ${quote.status}`,
      `Montant total : ${(quote.totalAmount / 100).toFixed(2)} €`,
      ...quote.lines.map((l) => `- ${l.label} × ${l.quantity} = ${((l.unitPrice * l.quantity) / 100).toFixed(2)} €`),
    ];

    return { title: input.title ?? `Devis — ${quote.reference}`, content: lines.join("\n"), metadata: { quoteId: quote.id } };
  },
};

const conversationParser: DocumentParser = {
  sourceType: KnowledgeSourceType.CONVERSATION,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "CONVERSATION");
    const conversation = await prisma.conversation.findFirst({
      where: { id, lead: { organizationId: ctx.organizationId } },
      include: { lead: true },
    });
    if (!conversation) throw new NotFoundError("Conversation introuvable.");

    const lines = [
      `Conversation avec ${conversation.lead.establishmentName} (${conversation.direction}, ${conversation.channel})`,
      conversation.subject && `Sujet : ${conversation.subject}`,
      "",
      conversation.body,
    ].filter((line): line is string => Boolean(line));

    return {
      title: input.title ?? `Conversation — ${conversation.lead.establishmentName}`,
      content: lines.join("\n"),
      metadata: { conversationId: conversation.id },
    };
  },
};

const decisionParser: DocumentParser = {
  sourceType: KnowledgeSourceType.DECISION,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "DECISION");
    const action = await prisma.commercialAction.findFirst({
      where: { id, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId },
      include: { prospect: true },
    });
    if (!action) throw new NotFoundError("Action commerciale introuvable.");

    const lines = [
      `Décision sur "${action.title}" (${action.type}) — prospect ${action.prospect.companyName}`,
      `Statut : ${action.status}`,
      action.reasoning && `Justification : ${action.reasoning}`,
      action.decidedAt && `Décidée le : ${action.decidedAt.toISOString()}`,
    ].filter((line): line is string => Boolean(line));

    return { title: input.title ?? `Décision — ${action.title}`, content: lines.join("\n"), metadata: { commercialActionId: action.id } };
  },
};

const workflowParser: DocumentParser = {
  sourceType: KnowledgeSourceType.WORKFLOW,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "WORKFLOW");
    const definition = await prisma.workflowDefinition.findFirst({
      where: { id, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId },
      include: { activeVersion: true },
    });
    if (!definition) throw new NotFoundError("Workflow introuvable.");

    const graph = definition.activeVersion?.graph as { nodes?: { id: string; type: string }[] } | undefined;
    const nodesSummary = graph?.nodes?.map((n) => `${n.id} (${n.type})`).join(", ") ?? "aucune version active";

    const lines = [
      `Workflow "${definition.name}" (${definition.key}) — statut ${definition.status}`,
      definition.description && `Description : ${definition.description}`,
      `Noeuds : ${nodesSummary}`,
    ].filter((line): line is string => Boolean(line));

    return { title: input.title ?? `Workflow — ${definition.name}`, content: lines.join("\n"), metadata: { workflowDefinitionId: definition.id } };
  },
};

const logParser: DocumentParser = {
  sourceType: KnowledgeSourceType.LOG,
  async parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument> {
    const id = requireSourceRef(input, "LOG");
    const run = await prisma.workflowRun.findFirst({
      where: { id, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId },
      include: { logs: { orderBy: { createdAt: "asc" } }, workflowDefinition: { select: { name: true } } },
    });
    if (!run) throw new NotFoundError("Exécution introuvable.");

    const lines = [
      `Journal d'exécution — ${run.workflowDefinition.name} (statut ${run.status})`,
      ...run.logs.map((l) => `[${l.level}] ${l.message}`),
    ];

    return { title: input.title ?? `Journal — ${run.workflowDefinition.name}`, content: lines.join("\n"), metadata: { workflowRunId: run.id } };
  },
};

export const recordParsers: DocumentParser[] = [crmParser, quoteParser, conversationParser, decisionParser, workflowParser, logParser];
