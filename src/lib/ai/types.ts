import type { MessageLanguage, MessageTone, MessageType, ReplyIntent } from "@/generated/prisma/enums";

export type LeadFactsInput = {
  establishmentName: string;
  category: string;
  city?: string | null;
  region?: string | null;
  websiteUrl?: string | null;
  hasVirtualTour?: boolean | null;
  reviewCount?: number | null;
  averageRating?: number | null;
  socialLinks?: Record<string, string> | null;
  closedBusiness?: boolean;
  contactName?: string | null;
  notes?: string[];
};

export type LeadAnalysisResult = {
  summary: string;
  clienteleType: string | null;
  digitalPresenceQuality: string | null;
  hasVirtualTourAssessment: string | null;
  opportunities: string[];
  recommendedAngle: string | null;
  recommendedService: string | null;
  priorityLevel: "immediate" | "interessant" | "a_verifier" | "faible";
  personalizedArguments: string[];
  negativeSignals: string[];
  verifiedFacts: string[];
  estimatedFacts: string[];
  missingInfo: string[];
};

export type ScoreRecommendation = {
  suggestedValue: number;
  rationale: string[];
};

export type GenerateMessageInput = {
  organization: {
    name: string;
    pitch?: string | null;
    tone: string;
    emailSignature?: string | null;
    portfolioLinks?: string[];
  };
  lead: LeadFactsInput;
  analysis?: LeadAnalysisResult | null;
  type: MessageType;
  tone: MessageTone;
  language: MessageLanguage;
  previousMessageSummary?: string | null;
  unsubscribeUrl: string;
};

export type GeneratedMessage = {
  subject: string | null;
  body: string;
};

export type ClassifyReplyInput = {
  body: string;
  subject?: string | null;
};

export type ClassifyReplyResult = {
  intent: ReplyIntent;
  confidence: number;
  reasoning: string;
};

export type NextActionRecommendation = {
  action: string;
  reasoning: string;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  analyzeLead(input: LeadFactsInput): Promise<LeadAnalysisResult>;
  recommendScore(input: LeadFactsInput, analysis: LeadAnalysisResult): Promise<ScoreRecommendation>;
  generateMessage(input: GenerateMessageInput): Promise<GeneratedMessage>;
  classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyResult>;
  summarizeConversation(messages: { direction: string; body: string }[]): Promise<string>;
  recommendNextAction(context: { stage: string; lastIntent?: string | null }): Promise<NextActionRecommendation>;
  translate(text: string, targetLanguage: MessageLanguage): Promise<string>;
  generateSalesReport(stats: Record<string, number>): Promise<string>;
  estimateCostUsd(promptChars: number, responseChars: number): number;
}
