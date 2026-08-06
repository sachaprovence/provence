import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";
import { getLlmProvider, getActiveLlmProvider, registerBuiltInLlmProviders, listRegisteredLlmProviderKeys } from "@/lib/agents/llm";
import type { LlmMessage } from "@/lib/agents/llm/types";
import { getToolHandler } from "@/lib/agents/tool-registry";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { getPermissionsForRole } from "@/lib/workspace-permissions";
import { setMemoryEntry, getMemoryEntry } from "@/lib/memory/memory-engine";
import { MemoryScopeType, MemoryKind, CustomAgentChatRole } from "@/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Agents personnalisés (v1.6, ADR 0049) : un utilisateur crée son propre
 * agent depuis l'UI (`/agents`) — nom, prompt système, fournisseur LLM/
 * modèle, outils autorisés, mémoire. Distinct du Framework Agents existant
 * (`AgentDefinition`/`AgentInstallation`, catalogue préconçu) : réutilise
 * son registre LLM, son registre d'outils et le Memory Engine générique
 * plutôt que de dupliquer quoi que ce soit.
 *
 * Pas de function-calling autonome : le LLM générique de ce dépôt ne fait
 * que de la complétion de texte (voir `src/lib/agents/llm/types.ts`), et
 * aucun agent existant n'orchestre d'appel de fonction décidé par le
 * modèle lui-même. L'exécution d'un outil est donc toujours une action
 * UTILISATEUR explicite (`runTool`), jamais une décision du LLM — un choix
 * délibéré de sécurité et de simplicité, documenté dans l'ADR 0049.
 */

const MEMORY_SUMMARY_KEY = "conversation_summary";
const MAX_HISTORY_MESSAGES = 20;
const MAX_MEMORY_SUMMARY_CHARS = 4000;

export type CreateCustomAgentInput = {
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  providerKey?: string;
  model?: string | null;
  toolKeys?: string[];
  memoryEnabled?: boolean;
};

function assertName(name: string) {
  if (!name || name.trim().length < 2) {
    throw new ValidationError("Le nom de l'agent doit contenir au moins 2 caractères.");
  }
}

async function assertValidProviderKey(providerKey: string) {
  registerBuiltInLlmProviders();
  const known = listRegisteredLlmProviderKeys();
  if (!known.includes(providerKey)) {
    throw new ValidationError(`Fournisseur LLM inconnu : "${providerKey}". Fournisseurs disponibles : ${known.join(", ")}.`);
  }
}

async function assertValidToolKeys(toolKeys: string[]) {
  if (toolKeys.length === 0) return;
  const rows = await prisma.agentTool.findMany({ where: { key: { in: toolKeys }, isActive: true }, select: { key: true } });
  const found = new Set(rows.map((r) => r.key));
  const unknown = toolKeys.filter((k) => !found.has(k));
  if (unknown.length > 0) {
    throw new ValidationError(`Outil(s) inconnu(s) ou inactif(s) : ${unknown.join(", ")}.`);
  }
}

/** Catalogue des outils disponibles pour la création/édition d'un agent personnalisé. */
export async function listAvailableTools() {
  return prisma.agentTool.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

/** Fournisseurs LLM disponibles (clé + modèle par défaut) pour le formulaire de création. */
export function listAvailableLlmProviders() {
  registerBuiltInLlmProviders();
  return listRegisteredLlmProviderKeys().map((key) => {
    const provider = getLlmProvider(key);
    return { key, defaultModel: provider?.defaultModel ?? null };
  });
}

export async function createCustomAgent(actor: WorkspaceActor, input: CreateCustomAgentInput) {
  assertName(input.name);
  const providerKey = input.providerKey?.trim() || "demo";
  await assertValidProviderKey(providerKey);
  const toolKeys = Array.from(new Set(input.toolKeys ?? []));
  await assertValidToolKeys(toolKeys);

  const agent = await prisma.customAgent.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      systemPrompt: input.systemPrompt?.trim() || null,
      providerKey,
      model: input.model?.trim() || null,
      toolKeys,
      memoryEnabled: input.memoryEnabled ?? true,
      createdById: actor.user.id,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "custom_agent.created",
    entityType: "CustomAgent",
    entityId: agent.id,
    metadata: { name: agent.name, providerKey },
  });

  return agent;
}

export async function listCustomAgents(actor: WorkspaceActor, params?: { includeArchived?: boolean }) {
  return prisma.customAgent.findMany({
    where: {
      workspaceId: actor.workspace.id,
      archivedAt: params?.includeArchived ? undefined : null,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Résout un agent en le filtrant STRICTEMENT par le workspace de l'acteur — jamais de confiance dans le seul id fourni par le client. */
export async function resolveCustomAgentOrThrow(actor: WorkspaceActor, customAgentId: string) {
  const agent = await prisma.customAgent.findFirst({
    where: { id: customAgentId, workspaceId: actor.workspace.id },
  });
  if (!agent) throw new NotFoundError("Agent introuvable.");
  return agent;
}

export type UpdateCustomAgentInput = Partial<CreateCustomAgentInput>;

export async function updateCustomAgent(actor: WorkspaceActor, customAgentId: string, input: UpdateCustomAgentInput) {
  const agent = await resolveCustomAgentOrThrow(actor, customAgentId);

  if (input.name !== undefined) assertName(input.name);
  if (input.providerKey !== undefined) await assertValidProviderKey(input.providerKey);
  const toolKeys = input.toolKeys !== undefined ? Array.from(new Set(input.toolKeys)) : undefined;
  if (toolKeys !== undefined) await assertValidToolKeys(toolKeys);

  const updated = await prisma.customAgent.update({
    where: { id: agent.id },
    data: {
      name: input.name?.trim(),
      description: input.description !== undefined ? input.description?.trim() || null : undefined,
      systemPrompt: input.systemPrompt !== undefined ? input.systemPrompt?.trim() || null : undefined,
      providerKey: input.providerKey?.trim(),
      model: input.model !== undefined ? input.model?.trim() || null : undefined,
      toolKeys,
      memoryEnabled: input.memoryEnabled,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "custom_agent.updated",
    entityType: "CustomAgent",
    entityId: agent.id,
  });

  return updated;
}

export async function archiveCustomAgent(actor: WorkspaceActor, customAgentId: string) {
  const agent = await resolveCustomAgentOrThrow(actor, customAgentId);
  const archived = await prisma.customAgent.update({ where: { id: agent.id }, data: { archivedAt: new Date() } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "custom_agent.archived",
    entityType: "CustomAgent",
    entityId: agent.id,
  });

  return archived;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function listConversations(actor: WorkspaceActor, customAgentId: string) {
  await resolveCustomAgentOrThrow(actor, customAgentId);
  return prisma.customAgentConversation.findMany({
    where: { customAgentId, workspaceId: actor.workspace.id },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createConversation(actor: WorkspaceActor, customAgentId: string, title?: string) {
  await resolveCustomAgentOrThrow(actor, customAgentId);
  return prisma.customAgentConversation.create({
    data: {
      customAgentId,
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      title: title?.trim() || "Nouvelle conversation",
      createdById: actor.user.id,
    },
  });
}

/** Résout une conversation en la filtrant STRICTEMENT par le workspace de l'acteur. */
export async function resolveConversationOrThrow(actor: WorkspaceActor, conversationId: string) {
  const conversation = await prisma.customAgentConversation.findFirst({
    where: { id: conversationId, workspaceId: actor.workspace.id },
    include: { customAgent: true },
  });
  if (!conversation) throw new NotFoundError("Conversation introuvable.");
  return conversation;
}

export async function listMessages(actor: WorkspaceActor, conversationId: string) {
  await resolveConversationOrThrow(actor, conversationId);
  return prisma.customAgentChatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function resolveProvider(providerKey: string) {
  registerBuiltInLlmProviders();
  return getLlmProvider(providerKey) ?? getActiveLlmProvider();
}

/** Contexte minimal compatible `ToolHandler` (voir `src/lib/agents/types.ts`) — un agent personnalisé n'est pas une `AgentInstallation`, mais un outil ne lit jamais que ces champs. */
function buildToolContext(actor: WorkspaceActor, agent: { id: string; organizationId: string; workspaceId: string; toolKeys: string[] }) {
  const grantedPermissions = getPermissionsForRole(actor.workspace.role);
  return {
    installation: {
      id: agent.id,
      organizationId: agent.organizationId,
      workspaceId: agent.workspaceId,
      grantedToolKeys: agent.toolKeys,
      grantedPermissions: [...grantedPermissions],
    } as never,
    run: { id: `custom-agent-chat:${agent.id}` } as never,
  };
}

export async function sendMessage(actor: WorkspaceActor, conversationId: string, content: string) {
  if (!content || !content.trim()) throw new ValidationError("Le message ne peut pas être vide.");

  const conversation = await resolveConversationOrThrow(actor, conversationId);
  const agent = conversation.customAgent;

  await prisma.customAgentChatMessage.create({
    data: { conversationId, role: CustomAgentChatRole.USER, content: content.trim() },
  });

  const history = await prisma.customAgentChatMessage.findMany({
    where: { conversationId, role: { in: [CustomAgentChatRole.USER, CustomAgentChatRole.ASSISTANT] } },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
  });

  const messages: LlmMessage[] = [];
  if (agent.systemPrompt) messages.push({ role: "system", content: agent.systemPrompt });

  let memoryNote: string | null = null;
  if (agent.memoryEnabled) {
    const entry = await getMemoryEntry(actor.organization.id, {
      scopeType: MemoryScopeType.AGENT,
      scopeId: agent.id,
      kind: MemoryKind.LONG_TERM,
      key: MEMORY_SUMMARY_KEY,
    });
    memoryNote = (entry?.value as { summary?: string } | null)?.summary ?? null;
    if (memoryNote) {
      messages.push({ role: "system", content: `Mémoire de l'agent (résumé des échanges précédents) :\n${memoryNote}` });
    }
  }

  for (const m of history.reverse()) {
    messages.push({ role: m.role === CustomAgentChatRole.USER ? "user" : "assistant", content: m.content });
  }

  const provider = resolveProvider(agent.providerKey);
  const result = await provider.complete({ model: agent.model ?? undefined, messages });

  const assistantMessage = await prisma.customAgentChatMessage.create({
    data: { conversationId, role: CustomAgentChatRole.ASSISTANT, content: result.text },
  });

  await prisma.customAgentConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), updatedAt: new Date() },
  });

  if (agent.memoryEnabled) {
    const nextSummary = `${memoryNote ? memoryNote + "\n" : ""}Utilisateur : ${content.trim()}\nAgent : ${result.text}`.slice(
      -MAX_MEMORY_SUMMARY_CHARS
    );
    await setMemoryEntry({
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      scopeType: MemoryScopeType.AGENT,
      scopeId: agent.id,
      kind: MemoryKind.LONG_TERM,
      key: MEMORY_SUMMARY_KEY,
      value: { summary: nextSummary },
      createdById: actor.user.id,
    });
  }

  return { assistantMessage, provider: result.provider, model: result.model };
}

/** Exécution explicite d'un outil déclaratif depuis l'UI de chat — jamais une décision autonome du LLM (voir docstring en tête de fichier). */
export async function runTool(actor: WorkspaceActor, conversationId: string, toolKey: string, toolInput: unknown) {
  // Rappel défensif indispensable (voir ADR 0013 / execution-engine.ts#executeAgentRun) :
  // ce module peut être chargé dans un contexte d'exécution distinct de celui où
  // src/instrumentation.ts a appelé registerBuiltInAgentComponents() au démarrage.
  registerBuiltInAgentComponents();

  const conversation = await resolveConversationOrThrow(actor, conversationId);
  const agent = conversation.customAgent;

  if (!agent.toolKeys.includes(toolKey)) {
    throw new ForbiddenError(`Cet agent n'est pas autorisé à utiliser l'outil "${toolKey}".`);
  }

  const handler = getToolHandler(toolKey);
  if (!handler) throw new NotFoundError(`Outil introuvable ou non enregistré : "${toolKey}".`);

  const context = buildToolContext(actor, agent);
  let output: unknown;
  let errorMessage: string | null = null;
  try {
    output = await handler.handle(toolInput, context);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erreur inconnue.";
  }

  const message = await prisma.customAgentChatMessage.create({
    data: {
      conversationId,
      role: CustomAgentChatRole.TOOL,
      content: errorMessage ? `Échec : ${errorMessage}` : "Outil exécuté avec succès.",
      toolKey,
      toolInput: (toolInput ?? {}) as never,
      toolOutput: errorMessage ? undefined : ((output ?? {}) as never),
    },
  });

  await prisma.customAgentConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  if (errorMessage) throw new ValidationError(errorMessage);
  return { message, output };
}
