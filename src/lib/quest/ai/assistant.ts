import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { AssistantReplySchema, type AssistantAction, type AssistantReply } from "./schemas";
import { formatUserContextForPrompt, type UserContext } from "@/lib/quest/context-builder";

/**
 * Assistant contextuel (§19-21 du brief) — connaît objectifs/progression/
 * dernières quêtes/profil/mémoires, répond en langage naturel ET peut agir
 * via des actions structurées validées Zod (`AssistantActionSchema`),
 * jamais en parsant du texte libre pour modifier des données (§21) : que la
 * réponse vienne du LLM ou du mode démo, les actions retournées sont
 * TOUJOURS exécutées par le même code côté service
 * (`src/lib/quest/assistant-service.ts`), qui ne fait confiance qu'à leur
 * forme validée, jamais au texte du message.
 *
 * `userContext` (Context Builder) rend l'assistant réellement "même
 * cerveau" que la génération de quêtes — mêmes profil/mémoires/stratégies,
 * un seul format (`formatUserContextForPrompt`), pas une reconstruction
 * séparée. `activeGoals`/`nextQuest`/`recentMemories` restent des champs
 * dédiés (pas juste dérivés de `userContext`) car le mode démo (déterministe,
 * sans LLM) en a besoin pour son appariement par mots-clés.
 */
export type AssistantContext = {
  activeGoals: { id: string; title: string; progressPercent: number }[];
  nextQuest: { id: string; title: string; estimatedMinutes: number; difficulty: number } | null;
  recentMemories: { type: string; content: string; confidence: number }[];
  userContext: UserContext;
};

export type AssistantTurnInput = {
  history: { role: "USER" | "ASSISTANT"; content: string }[];
  message: string;
  context: AssistantContext;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function assistantDemo(input: AssistantTurnInput): AssistantReply {
  const text = normalize(input.message);
  const actions: AssistantAction[] = [];
  const nextQuest = input.context.nextQuest;

  if ((text.includes("bloque") || text.includes("trop dur") || text.includes("trop difficile") || text.includes("trop complique")) && nextQuest) {
    actions.push({ kind: "DECOMPOSE_QUEST", questId: nextQuest.id });
    return AssistantReplySchema.parse({
      message: `Je découpe cette quête en étapes plus petites pour repartir sur quelque chose de plus simple : ${nextQuest.title}`,
      actions,
    });
  }

  if (text.includes("remplace") && nextQuest) {
    actions.push({ kind: "REPLACE_QUEST", questId: nextQuest.id, reason: input.message });
    return AssistantReplySchema.parse({
      message: `Je remplace cette quête par une autre action : ${nextQuest.title}`,
      actions,
    });
  }

  if ((text.includes("reduis") || text.includes("plus facile") || text.includes("moins dur")) && nextQuest) {
    actions.push({ kind: "REDUCE_DIFFICULTY", questId: nextQuest.id });
    return AssistantReplySchema.parse({
      message: `Je réduis la difficulté de cette quête : ${nextQuest.title}`,
      actions,
    });
  }

  if (text.includes("pause")) {
    const matchedGoal = input.context.activeGoals.find((g) => text.includes(normalize(g.title)));
    if (matchedGoal) {
      actions.push({ kind: "PAUSE_GOAL", goalId: matchedGoal.id });
      return AssistantReplySchema.parse({
        message: `Je mets « ${matchedGoal.title} » en pause. Tu pourras le reprendre quand tu veux.`,
        actions,
      });
    }
  }

  if (text.includes("aucune motivation") || text.includes("pas motive") || text.includes("pas envie")) {
    return AssistantReplySchema.parse({
      message: nextQuest
        ? `Pas de souci. Plutôt qu'un gros effort, vise juste ceci (${nextQuest.estimatedMinutes} min) — une seule petite action suffit aujourd'hui : ${nextQuest.title}`
        : "Pas de souci. Dis-moi combien de temps tu as et je te propose une toute petite action pour aujourd'hui.",
      actions: [],
    });
  }

  const minutesMatch = text.match(/(\d+)\s*min/);
  if (minutesMatch) {
    return AssistantReplySchema.parse({
      message: `Avec ${minutesMatch[1]} minutes, utilise "Que dois-je faire maintenant ?" sur l'écran Aujourd'hui pour que je te propose la meilleure action pour ce créneau.`,
      actions: [],
    });
  }

  if (nextQuest) {
    return AssistantReplySchema.parse({
      message: `Ta prochaine quête (${nextQuest.estimatedMinutes} min, difficulté ${nextQuest.difficulty}/5) : ${nextQuest.title}. Dis-moi si elle est trop difficile, si tu veux la remplacer, ou si tu es bloqué.`,
      actions: [],
    });
  }

  return AssistantReplySchema.parse({
    message: "Crée un objectif sur l'écran Objectifs pour que je puisse te proposer ta prochaine quête.",
    actions: [],
  });
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantReply> {
  if (isDemoMode()) return assistantDemo(input);

  const prompt = `Objectifs actifs : ${JSON.stringify(input.context.activeGoals, null, 2)}
Prochaine quête recommandée : ${input.context.nextQuest ? JSON.stringify(input.context.nextQuest, null, 2) : "aucune"}

${formatUserContextForPrompt(input.context.userContext)}

Historique de la conversation :
${input.history.map((m) => `[${m.role}] ${m.content}`).join("\n")}

Nouveau message de l'utilisateur : "${input.message}"

Réponds de façon utile et actionnable. Si le message implique une action sur les données (mettre en pause un objectif, remplacer/décomposer/réduire la difficulté d'une quête), inclus l'action structurée correspondante dans "actions" — n'invente jamais d'id, utilise uniquement ceux fournis dans le contexte ci-dessus. Sinon, "actions" reste vide.

Réponds UNIQUEMENT avec un objet JSON : { "message": string, "actions": [{ "kind": "PAUSE_GOAL"|"RESUME_GOAL"|"REPLACE_QUEST"|"REDUCE_DIFFICULTY"|"DECOMPOSE_QUEST"|"NONE", ... }] }`;

  return generateStructured({
    schema: AssistantReplySchema,
    system: QUEST_AI_SYSTEM_PROMPT,
    prompt,
    context: "assistant",
  });
}
