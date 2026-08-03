import "server-only";
import { MessageType, ReplyIntent } from "@/generated/prisma/enums";
import type { MessageLanguage } from "@/generated/prisma/enums";
import type {
  AIProvider,
  ClassifyReplyInput,
  ClassifyReplyResult,
  GenerateMessageInput,
  GeneratedMessage,
  LeadAnalysisResult,
  LeadFactsInput,
  NextActionRecommendation,
  ScoreRecommendation,
} from "../types";
import { requireEnv, callAnthropic, parseJsonResponse } from "./http-helpers";

const SYSTEM_PROMPT =
  "Tu es l'assistant IA commercial de Provence 360, une agence qui vend des visites virtuelles 360° " +
  "à des professionnels (hôtels, villas, agences immobilières, restaurants, campings...) en Provence. " +
  "Réponds toujours en français, de façon factuelle, sans jamais inventer de données non fournies.";

const LANGUAGE_LABEL: Record<MessageLanguage, string> = {
  FR: "français",
  EN: "anglais",
  HR: "croate",
  IT: "italien",
  ES: "espagnol",
};

const REPLY_INTENT_VALUES: string[] = Object.values(ReplyIntent);

/**
 * Fournisseur IA réel basé sur l'API Anthropic (Claude), implémentant la
 * même interface `AIProvider` que `DemoAIProvider` (référence comportementale
 * pour la forme des données attendues). Contrairement au fournisseur simulé,
 * chaque méthode fait un vrai appel réseau et échoue EXPLICITEMENT (jamais un
 * résultat fabriqué) si `ANTHROPIC_API_KEY` est absente, si l'appel échoue,
 * ou si la réponse ne contient pas le JSON structuré demandé — même
 * convention que les fournisseurs LLM/email/Calendar/Sentry déjà réels.
 *
 * Distincte de `src/lib/agents/llm/providers/anthropic.ts` : cette dernière
 * implémente `LlmProvider` (texte brut, utilisée par le Framework d'Agents
 * pour `generateAgentNarrative`) ; celle-ci implémente `AIProvider` (données
 * structurées : score, analyse, classification...), utilisée par le cœur CRM
 * historique (analyse de prospect, génération de message, scoring, etc.).
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model = "claude-sonnet-5";

  /** `baseUrl` : jamais utilisé en production, seulement pour cibler un serveur de test local. */
  constructor(private readonly options: { baseUrl?: string } = {}) {}

  private async completeJson<T>(prompt: string, context: string): Promise<T> {
    const apiKey = requireEnv("ANTHROPIC_API_KEY", "Anthropic (IA)");
    const text = await callAnthropic({
      apiKey,
      model: this.model,
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 1536,
      baseUrl: this.options.baseUrl,
    });
    return parseJsonResponse<T>(text, context);
  }

  private async completeText(prompt: string): Promise<string> {
    const apiKey = requireEnv("ANTHROPIC_API_KEY", "Anthropic (IA)");
    const text = await callAnthropic({
      apiKey,
      model: this.model,
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 1024,
      baseUrl: this.options.baseUrl,
    });
    return text.trim();
  }

  async analyzeLead(input: LeadFactsInput): Promise<LeadAnalysisResult> {
    const prompt = `Analyse ce prospect. Réponds UNIQUEMENT avec un objet JSON (sans texte autour, sans bloc markdown) au format exact suivant :
{
  "summary": string,
  "clienteleType": string | null,
  "digitalPresenceQuality": string | null,
  "hasVirtualTourAssessment": string | null,
  "opportunities": string[],
  "recommendedAngle": string | null,
  "recommendedService": string | null,
  "priorityLevel": "immediate" | "interessant" | "a_verifier" | "faible",
  "personalizedArguments": string[],
  "negativeSignals": string[],
  "verifiedFacts": string[],
  "estimatedFacts": string[],
  "missingInfo": string[]
}

Distingue bien les faits VÉRIFIÉS (donnés explicitement ci-dessous) des faits ESTIMÉS (déduits/supposés) : ne place jamais une estimation dans "verifiedFacts".

Données du prospect :
${JSON.stringify(input, null, 2)}`;

    const result = await this.completeJson<Partial<LeadAnalysisResult>>(prompt, "analyzeLead");
    return {
      summary: result.summary ?? "",
      clienteleType: result.clienteleType ?? null,
      digitalPresenceQuality: result.digitalPresenceQuality ?? null,
      hasVirtualTourAssessment: result.hasVirtualTourAssessment ?? null,
      opportunities: result.opportunities ?? [],
      recommendedAngle: result.recommendedAngle ?? null,
      recommendedService: result.recommendedService ?? null,
      priorityLevel: result.priorityLevel ?? "a_verifier",
      personalizedArguments: result.personalizedArguments ?? [],
      negativeSignals: result.negativeSignals ?? [],
      verifiedFacts: result.verifiedFacts ?? [],
      estimatedFacts: result.estimatedFacts ?? [],
      missingInfo: result.missingInfo ?? [],
    };
  }

  async recommendScore(input: LeadFactsInput, analysis: LeadAnalysisResult): Promise<ScoreRecommendation> {
    const prompt = `Propose un score de priorité commerciale (0 à 100) pour ce prospect, avec une justification en plusieurs points courts. Réponds UNIQUEMENT avec un objet JSON : { "suggestedValue": number, "rationale": string[] }.

Prospect :
${JSON.stringify(input, null, 2)}

Analyse déjà réalisée :
${JSON.stringify(analysis, null, 2)}`;

    const result = await this.completeJson<Partial<ScoreRecommendation>>(prompt, "recommendScore");
    const rawValue = typeof result.suggestedValue === "number" ? result.suggestedValue : 0;
    return { suggestedValue: Math.max(0, Math.min(100, Math.round(rawValue))), rationale: result.rationale ?? [] };
  }

  async generateMessage(input: GenerateMessageInput): Promise<GeneratedMessage> {
    const { organization, lead, analysis, type, tone, language, previousMessageSummary, unsubscribeUrl } = input;
    const noSubjectTypes: MessageType[] = [MessageType.LINKEDIN, MessageType.SMS, MessageType.CALL_SCRIPT];
    const needsUnsubscribe = !noSubjectTypes.includes(type);

    const prompt = `Rédige un message commercial de type "${type}", ton "${tone}", en ${LANGUAGE_LABEL[language]}, pour ce prospect au nom de cette organisation. Réponds UNIQUEMENT avec un objet JSON : { "subject": string | null, "body": string }. "subject" doit être null pour les types LINKEDIN, SMS et CALL_SCRIPT.${
      needsUnsubscribe ? ` Le corps du message doit inclure explicitement ce lien de désinscription : ${unsubscribeUrl}.` : ""
    }

Organisation :
${JSON.stringify(organization, null, 2)}

Prospect :
${JSON.stringify(lead, null, 2)}

Analyse : ${analysis ? JSON.stringify(analysis, null, 2) : "aucune"}
Résumé du précédent message envoyé : ${previousMessageSummary ?? "aucun"}`;

    const result = await this.completeJson<Partial<GeneratedMessage>>(prompt, "generateMessage");
    return { subject: result.subject ?? null, body: result.body ?? "" };
  }

  async classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyResult> {
    const prompt = `Classe cette réponse de prospect selon son intention. Réponds UNIQUEMENT avec un objet JSON : { "intent": string, "confidence": number, "reasoning": string }. "intent" doit être EXACTEMENT une de ces valeurs : ${REPLY_INTENT_VALUES.join(", ")}.

Sujet : ${input.subject ?? "(aucun)"}
Corps : ${input.body}`;

    const result = await this.completeJson<Partial<ClassifyReplyResult>>(prompt, "classifyReply");
    const intent = result.intent && REPLY_INTENT_VALUES.includes(result.intent) ? (result.intent as ReplyIntent) : ReplyIntent.UNKNOWN;
    const rawConfidence = typeof result.confidence === "number" ? result.confidence : 0;
    return { intent, confidence: Math.max(0, Math.min(1, rawConfidence)), reasoning: result.reasoning ?? "" };
  }

  async summarizeConversation(messages: { direction: string; body: string }[]): Promise<string> {
    const transcript = messages.map((m) => `[${m.direction}] ${m.body}`).join("\n\n");
    const prompt = `Résume cette conversation commerciale en 3 à 5 phrases factuelles, en français. Ne réponds qu'avec le résumé, sans préambule.

${transcript}`;
    return this.completeText(prompt);
  }

  async recommendNextAction(context: { stage: string; lastIntent?: string | null }): Promise<NextActionRecommendation> {
    const prompt = `Le prospect est au stade "${context.stage}"${
      context.lastIntent ? `, sa dernière intention détectée était "${context.lastIntent}"` : ""
    }. Recommande la prochaine action commerciale à effectuer. Réponds UNIQUEMENT avec un objet JSON : { "action": string, "reasoning": string }.`;

    const result = await this.completeJson<Partial<NextActionRecommendation>>(prompt, "recommendNextAction");
    return { action: result.action ?? "", reasoning: result.reasoning ?? "" };
  }

  async translate(text: string, targetLanguage: MessageLanguage): Promise<string> {
    const prompt = `Traduis ce texte en ${LANGUAGE_LABEL[targetLanguage]}. Ne réponds qu'avec la traduction, sans préambule ni guillemets.

${text}`;
    return this.completeText(prompt);
  }

  async generateSalesReport(stats: Record<string, number>): Promise<string> {
    const prompt = `Rédige un court rapport commercial (4 à 6 phrases, en français) à partir de ces statistiques : ${JSON.stringify(stats, null, 2)}. Ne réponds qu'avec le rapport.`;
    return this.completeText(prompt);
  }

  /**
   * Estimation approximative (4 caractères ≈ 1 token), à partir des tarifs
   * publics de Claude Sonnet (~3 $ / M tokens en entrée, ~15 $ / M tokens en
   * sortie). Ne reflète pas l'usage exact retourné par l'API (non disponible
   * dans cette signature, héritée de `AIProvider` et basée sur des longueurs
   * de texte) — à ajuster si les tarifs publics évoluent.
   */
  estimateCostUsd(promptChars: number, responseChars: number): number {
    const promptTokens = promptChars / 4;
    const responseTokens = responseChars / 4;
    const costUsd = (promptTokens / 1_000_000) * 3 + (responseTokens / 1_000_000) * 15;
    return Math.round(costUsd * 1e6) / 1e6;
  }
}
