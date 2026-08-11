import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { runAssistantTurn, type AssistantContext } from "./ai/assistant";
import type { AssistantAction } from "./ai/schemas";
import { getNextBestActionForUser, replaceQuest, reduceQuestDifficulty, decomposeQuest } from "./quest-service";
import { setGoalStatus } from "./goal-service";
import { writeQuestAuditLog } from "./audit";
import { buildUserContext } from "./context-builder";

async function buildAssistantContext(userId: string): Promise<AssistantContext> {
  const [activeGoals, nextAction, memories, userContext] = await Promise.all([
    prisma.questGoal.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, title: true, progressPercent: true } }),
    getNextBestActionForUser(userId, {}),
    prisma.questMemory.findMany({ where: { userId, active: true, confidence: { gte: 0.6 } }, orderBy: { confidence: "desc" }, take: 5 }),
    buildUserContext(userId),
  ]);

  return {
    activeGoals,
    nextQuest: nextAction?.questRecord
      ? {
          id: nextAction.questRecord.id,
          title: nextAction.questRecord.title,
          estimatedMinutes: nextAction.questRecord.estimatedMinutes,
          difficulty: nextAction.questRecord.difficulty,
        }
      : null,
    recentMemories: memories.map((m) => ({ type: m.type, content: m.content, confidence: m.confidence })),
    userContext,
  };
}

/**
 * Exécute une action structurée de l'assistant (§21 du brief) — jamais un
 * parsing de texte libre : l'action a déjà été validée par
 * `AssistantActionSchema` (Zod) avant d'arriver ici, et chaque id est
 * revérifié comme appartenant à l'utilisateur par les fonctions de service
 * sous-jacentes (`requireOwnedGoal`/`requireOwnedQuest`), jamais fait
 * confiance aveuglément au LLM.
 */
async function executeAssistantAction(userId: string, action: AssistantAction): Promise<void> {
  switch (action.kind) {
    case "PAUSE_GOAL":
      await setGoalStatus(userId, action.goalId, "PAUSED");
      return;
    case "RESUME_GOAL":
      await setGoalStatus(userId, action.goalId, "ACTIVE");
      return;
    case "REPLACE_QUEST":
      await replaceQuest(userId, action.questId, action.reason);
      return;
    case "REDUCE_DIFFICULTY":
      await reduceQuestDifficulty(userId, action.questId);
      return;
    case "DECOMPOSE_QUEST":
      await decomposeQuest(userId, action.questId, "Décomposition demandée via l'assistant.");
      return;
    case "NONE":
      return;
  }
}

export async function getOrCreateConversation(userId: string, conversationId?: string | null) {
  if (conversationId) {
    const existing = await prisma.questConversation.findFirst({ where: { id: conversationId, userId } });
    if (existing) return existing;
  }
  return prisma.questConversation.create({ data: { userId } });
}

export async function listConversationMessages(userId: string, conversationId: string) {
  const conversation = await prisma.questConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new NotFoundError("Conversation introuvable.");
  return prisma.questConversationMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
}

export async function postAssistantMessage(userId: string, conversationId: string | null | undefined, message: string) {
  const conversation = await getOrCreateConversation(userId, conversationId);
  const history = await prisma.questConversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  await prisma.questConversationMessage.create({ data: { conversationId: conversation.id, role: "USER", content: message } });

  const context = await buildAssistantContext(userId);
  const reply = await runAssistantTurn({
    history: history.map((m) => ({ role: m.role, content: m.content })),
    message,
    context,
  });

  for (const action of reply.actions) {
    try {
      await executeAssistantAction(userId, action);
    } catch {
      // Une action invalide (id inconnu/pas à l'utilisateur) ne doit jamais faire échouer toute la réponse conversationnelle —
      // elle est simplement ignorée, journalisée séparément pour investigation.
      await writeQuestAuditLog({ userId, action: "assistant.action_failed", entityType: "QuestConversation", entityId: conversation.id, metadata: { attempted: action } });
    }
  }

  const assistantMessage = await prisma.questConversationMessage.create({
    data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.message, actions: reply.actions },
  });
  await prisma.questConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return { conversation, reply: assistantMessage };
}

export async function listConversations(userId: string) {
  return prisma.questConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20 });
}
