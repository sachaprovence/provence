import { MessageLanguage, MessageTone, MessageType, ReplyIntent } from "@/generated/prisma/enums";
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
} from "./types";

const CATEGORY_LABEL: Record<string, string> = {
  AIRBNB_HOST: "logement Airbnb",
  VILLA: "villa haut de gamme",
  HOTEL: "hôtel",
  CAMPING: "camping",
  REAL_ESTATE_AGENCY: "agence immobilière",
  RESTAURANT: "restaurant",
  EVENT_VENUE: "salle de réception",
  RETAIL: "commerce",
  OTHER: "établissement",
};

/**
 * Fournisseur IA simulé, déterministe (aucun appel réseau, aucun coût réel).
 * Sert de référence de comportement pour un futur fournisseur réel (OpenAI, Anthropic, etc.) :
 * un tel fournisseur doit implémenter la même interface `AIProvider`.
 */
export class DemoAIProvider implements AIProvider {
  readonly name = "demo";
  readonly model = "provence-demo-v1";

  async analyzeLead(input: LeadFactsInput): Promise<LeadAnalysisResult> {
    const categoryLabel = CATEGORY_LABEL[input.category] ?? "établissement";
    const verifiedFacts: string[] = [];
    const estimatedFacts: string[] = [];
    const missingInfo: string[] = [];
    const opportunities: string[] = [];
    const negativeSignals: string[] = [];
    const personalizedArguments: string[] = [];

    verifiedFacts.push(`Catégorie déclarée : ${categoryLabel}.`);
    if (input.city) verifiedFacts.push(`Localisation : ${input.city}${input.region ? `, ${input.region}` : ""}.`);
    else missingInfo.push("Ville non renseignée.");

    if (typeof input.reviewCount === "number") {
      verifiedFacts.push(`${input.reviewCount} avis en ligne recensés.`);
      if (input.reviewCount >= 50) opportunities.push("Volume d'avis suffisant pour capitaliser sur la preuve sociale.");
    } else {
      missingInfo.push("Nombre d'avis inconnu.");
    }

    if (typeof input.averageRating === "number") {
      verifiedFacts.push(`Note moyenne de ${input.averageRating.toFixed(1)}/5.`);
    } else {
      missingInfo.push("Note moyenne inconnue.");
    }

    if (input.hasVirtualTour === true) {
      verifiedFacts.push("Une visite virtuelle est déjà présente sur les supports identifiés.");
      negativeSignals.push("Visite virtuelle déjà existante : vérifier la qualité avant de proposer une refonte.");
    } else if (input.hasVirtualTour === false) {
      verifiedFacts.push("Aucune visite virtuelle détectée sur les supports identifiés.");
      opportunities.push("Absence de visite virtuelle : opportunité directe pour Provence 360.");
    } else {
      estimatedFacts.push("Présence d'une visite virtuelle non vérifiée (à confirmer manuellement).");
      missingInfo.push("Présence de visite virtuelle inconnue.");
    }

    if (input.websiteUrl) {
      verifiedFacts.push(`Site internet renseigné : ${input.websiteUrl}.`);
      estimatedFacts.push("Qualité d'immersion du site non auditée automatiquement (à vérifier visuellement).");
    } else {
      missingInfo.push("Aucun site internet renseigné.");
    }

    if (input.socialLinks && Object.keys(input.socialLinks).length > 0) {
      verifiedFacts.push(`Présence sur les réseaux : ${Object.keys(input.socialLinks).join(", ")}.`);
    } else {
      missingInfo.push("Présence sur les réseaux sociaux non renseignée.");
    }

    if (input.closedBusiness) {
      negativeSignals.push("Établissement signalé comme fermé.");
    }

    if (["VILLA", "HOTEL"].includes(input.category)) {
      personalizedArguments.push(
        "Une visite immersive 360° valorise le standing de l'établissement et rassure les clients avant réservation."
      );
    }
    if (["AIRBNB_HOST"].includes(input.category)) {
      personalizedArguments.push(
        "Sur Airbnb, les annonces avec visite virtuelle se distinguent nettement dans les résultats de recherche."
      );
    }
    if (["RESTAURANT", "EVENT_VENUE"].includes(input.category)) {
      personalizedArguments.push(
        "Une visite virtuelle de la salle aide les clients à se projeter avant de réserver un événement ou une table."
      );
    }
    if (personalizedArguments.length === 0) {
      personalizedArguments.push("Une présentation immersive améliore la conversion des visiteurs du site en demandes de contact.");
    }

    const recommendedService =
      input.category === "AIRBNB_HOST" || input.category === "VILLA"
        ? "Visite virtuelle premium"
        : input.category === "HOTEL" || input.category === "CAMPING"
        ? "Offre multi-logements"
        : "Visite virtuelle simple";

    const priorityLevel: LeadAnalysisResult["priorityLevel"] =
      opportunities.length >= 2 && negativeSignals.length === 0
        ? "immediate"
        : opportunities.length >= 1 && negativeSignals.length === 0
        ? "interessant"
        : negativeSignals.length > 0
        ? "faible"
        : "a_verifier";

    const summary = `${input.establishmentName} — ${categoryLabel}${input.city ? ` à ${input.city}` : ""}. ${
      input.hasVirtualTour === false
        ? "Aucune visite virtuelle identifiée, ce qui constitue une opportunité commerciale directe."
        : input.hasVirtualTour === true
        ? "Une visite virtuelle semble déjà en place ; l'angle commercial doit porter sur la qualité ou la mise à jour."
        : "La présence d'une visite virtuelle n'a pas pu être confirmée automatiquement."
    }`;

    return {
      summary,
      clienteleType: this.guessClientele(input.category),
      digitalPresenceQuality: input.websiteUrl ? "présence numérique existante, qualité à vérifier manuellement" : "présence numérique limitée ou non identifiée",
      hasVirtualTourAssessment:
        input.hasVirtualTour === undefined || input.hasVirtualTour === null
          ? "non vérifié"
          : input.hasVirtualTour
          ? "présente"
          : "absente",
      opportunities,
      recommendedAngle: opportunities[0] ?? "Mettre en avant la différenciation par l'image et l'expérience immersive.",
      recommendedService,
      priorityLevel,
      personalizedArguments,
      negativeSignals,
      verifiedFacts,
      estimatedFacts,
      missingInfo,
    };
  }

  private guessClientele(category: string): string {
    switch (category) {
      case "AIRBNB_HOST":
      case "VILLA":
        return "voyageurs loisirs, séjours courts et haut de gamme";
      case "HOTEL":
        return "clientèle touristique et affaires";
      case "CAMPING":
        return "familles et voyageurs en séjour prolongé";
      case "REAL_ESTATE_AGENCY":
        return "acquéreurs et locataires en recherche active";
      case "RESTAURANT":
      case "EVENT_VENUE":
        return "clientèle locale et événementielle";
      default:
        return "clientèle grand public";
    }
  }

  async recommendScore(input: LeadFactsInput, analysis: LeadAnalysisResult): Promise<ScoreRecommendation> {
    const rationale: string[] = [];
    let value = 40;
    if (["VILLA", "HOTEL"].includes(input.category)) {
      value += 20;
      rationale.push("+20 établissement haut de gamme");
    }
    if (input.hasVirtualTour === false) {
      value += 15;
      rationale.push("+15 aucune visite virtuelle visible");
    }
    if ((input.reviewCount ?? 0) >= 50) {
      value += 10;
      rationale.push("+10 nombreux avis clients");
    }
    if (input.closedBusiness) {
      value -= 20;
      rationale.push("-20 établissement fermé");
    }
    if (analysis.negativeSignals.length > 0) {
      value -= 10;
      rationale.push("-10 signaux négatifs détectés par l'analyse");
    }
    return { suggestedValue: Math.max(0, Math.min(100, value)), rationale };
  }

  async generateMessage(input: GenerateMessageInput): Promise<GeneratedMessage> {
    const templates = buildMessageTemplates(input);
    return templates;
  }

  async classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyResult> {
    const text = `${input.subject ?? ""} ${input.body}`.toLowerCase();

    const rules: [ReplyIntent, RegExp][] = [
      [ReplyIntent.UNSUBSCRIBE, /(désabon|desabon|unsubscribe|stop|ne plus être contact|ne plus recevoir)/],
      [ReplyIntent.INVALID_ADDRESS, /(mailer-daemon|delivery failed|undeliverable|adresse invalide|n'existe plus)/],
      [ReplyIntent.AUTO_REPLY, /(réponse automatique|absence du bureau|out of office|congés)/],
      [ReplyIntent.NOT_INTERESTED, /(pas intéressé|non merci|ne souhaite pas|pas besoin)/],
      [ReplyIntent.ALREADY_EQUIPPED, /(déjà équipé|nous avons déjà|deja une visite|already have)/],
      [ReplyIntent.WRONG_CONTACT, /(mauvais interlocuteur|ce n'est pas moi|adressez-vous à|wrong person)/],
      [ReplyIntent.PRICE_REQUEST, /(tarif|prix|combien|devis|budget)/],
      [ReplyIntent.CALLBACK_REQUEST, /(rappeler|m'appeler|appel|téléphoner)/],
      [ReplyIntent.INTERESTED, /(intéressé|volontiers|oui je veux|partant|dites m'en plus|rendez-vous)/],
      [ReplyIntent.INFO_REQUEST, /(plus d'info|en savoir plus|détails|documentation)/],
    ];

    for (const [intent, pattern] of rules) {
      if (pattern.test(text)) {
        return { intent, confidence: 0.8, reasoning: `Correspondance de mots-clés pour l'intention ${intent}.` };
      }
    }
    return { intent: ReplyIntent.UNKNOWN, confidence: 0.3, reasoning: "Aucun motif clair détecté dans le message." };
  }

  async summarizeConversation(messages: { direction: string; body: string }[]): Promise<string> {
    if (messages.length === 0) return "Aucun échange enregistré.";
    const last = messages[messages.length - 1];
    return `${messages.length} échange(s) au total. Dernier message (${last.direction}) : "${last.body.slice(0, 160)}${
      last.body.length > 160 ? "…" : ""
    }"`;
  }

  async recommendNextAction(context: { stage: string; lastIntent?: string | null }): Promise<NextActionRecommendation> {
    if (context.lastIntent === ReplyIntent.INTERESTED) {
      return { action: "Proposer un rendez-vous", reasoning: "Le prospect a exprimé un intérêt explicite." };
    }
    if (context.lastIntent === ReplyIntent.PRICE_REQUEST) {
      return { action: "Envoyer une proposition tarifaire", reasoning: "Le prospect demande un tarif." };
    }
    if (context.lastIntent === ReplyIntent.CALLBACK_REQUEST) {
      return { action: "Planifier un appel", reasoning: "Le prospect souhaite être rappelé." };
    }
    if (context.stage === "APPOINTMENT_SCHEDULED") {
      return { action: "Préparer le rendez-vous", reasoning: "Un rendez-vous est déjà planifié." };
    }
    return { action: "Poursuivre la séquence de relance", reasoning: "Aucun signal fort détecté pour le moment." };
  }

  async translate(text: string, targetLanguage: MessageLanguage): Promise<string> {
    const prefixes: Record<MessageLanguage, string> = {
      FR: "",
      EN: "[EN] ",
      HR: "[HR] ",
      IT: "[IT] ",
      ES: "[ES] ",
    };
    return `${prefixes[targetLanguage]}${text}`;
  }

  async generateSalesReport(stats: Record<string, number>): Promise<string> {
    const lines = Object.entries(stats).map(([key, value]) => `- ${key} : ${value}`);
    return `Résumé commercial généré automatiquement :\n${lines.join("\n")}`;
  }

  estimateCostUsd(promptChars: number, responseChars: number): number {
    const estimatedTokens = (promptChars + responseChars) / 4;
    return Math.round((estimatedTokens / 1000) * 0.002 * 1e6) / 1e6;
  }
}

function buildMessageTemplates(input: GenerateMessageInput): GeneratedMessage {
  const { lead, organization, tone, type, unsubscribeUrl } = input;
  const categoryLabel = CATEGORY_LABEL[lead.category] ?? "établissement";
  const greeting = lead.contactName ? `Bonjour ${lead.contactName.split(" ")[0]},` : "Bonjour,";

  const observation =
    input.analysis?.opportunities[0] ??
    (lead.hasVirtualTour === false
      ? `je n'ai pas trouvé de visite virtuelle pour ${lead.establishmentName}`
      : `j'ai regardé la présentation en ligne de ${lead.establishmentName}`);

  const toneAdjective: Record<MessageTone, string> = {
    PROFESSIONAL: "avec plaisir",
    DIRECT_MODERN: "rapidement",
    PREMIUM: "avec le plus grand soin",
  };

  const signOff = organization.emailSignature ?? `${organization.name}`;
  const portfolioLine = organization.portfolioLinks && organization.portfolioLinks.length > 0
    ? `\nQuelques exemples de réalisations : ${organization.portfolioLinks.slice(0, 2).join(", ")}`
    : "";

  if (type === MessageType.FIRST_CONTACT_EMAIL) {
    const subject = `${lead.establishmentName} — une visite virtuelle 360° ?`;
    const body = `${greeting}

${observation}${lead.city ? ` (${lead.city})` : ""}. Pour un ${categoryLabel}, une visite immersive à 360° aide généralement les visiteurs à se projeter avant de réserver ou de contacter l'établissement.

${organization.name} réalise ce type de prestation en Provence${organization.pitch ? ` : ${organization.pitch}` : ""}.${portfolioLine}

Souhaitez-vous que je vous envoie ${toneAdjective[tone]} un exemple adapté à votre activité, ou un court appel de 10 minutes pour en discuter ?

Bonne journée,
${signOff}

Si vous ne souhaitez plus être contacté, cliquez ici : ${unsubscribeUrl}`;
    return { subject, body };
  }

  if (type === MessageType.FOLLOW_UP_SHORT) {
    const subject = `Petite relance — ${lead.establishmentName}`;
    const body = `${greeting}

Je me permets une courte relance suite à mon précédent message concernant une visite virtuelle pour ${lead.establishmentName}. Si le sujet n'est pas d'actualité, dites-le-moi simplement et je ne vous solliciterai plus.

Bonne journée,
${signOff}

Se désinscrire : ${unsubscribeUrl}`;
    return { subject, body };
  }

  if (type === MessageType.FOLLOW_UP_CASE_STUDY) {
    const subject = `Un exemple concret pour ${categoryLabel}s`;
    const body = `${greeting}

Pour illustrer ce que peut apporter une visite virtuelle à un ${categoryLabel}, voici un exemple de réalisation récente${portfolioLine ? " :" + portfolioLine : "."}

Cela vous donne-t-il envie d'un échange rapide pour votre propre établissement ?

${signOff}

Se désinscrire : ${unsubscribeUrl}`;
    return { subject, body };
  }

  if (type === MessageType.LINKEDIN) {
    return {
      subject: null,
      body: `Bonjour, je travaille avec des ${categoryLabel}s en Provence sur la mise en valeur numérique (visites virtuelles 360°). ${observation}. Ouvert à un échange rapide si le sujet vous intéresse.`,
    };
  }

  if (type === MessageType.SMS) {
    return {
      subject: null,
      body: `Bonjour, ${organization.name} - visites virtuelles 360° pour ${categoryLabel}s. Intéressé(e) par un échange ? Répondez STOP pour ne plus être contacté.`,
    };
  }

  if (type === MessageType.CALL_SCRIPT) {
    return {
      subject: null,
      body: `Script d'appel — ${lead.establishmentName}\n1. Se présenter et présenter ${organization.name}.\n2. Observation : ${observation}.\n3. Expliquer simplement la visite virtuelle 360° et son bénéfice pour un ${categoryLabel}.\n4. Proposer un exemple ou un rendez-vous court.\n5. Demander explicitement l'autorisation de recontacter si pas de décision immédiate.`,
    };
  }

  if (type === MessageType.APPOINTMENT_BRIEF) {
    return {
      subject: `Préparation RDV — ${lead.establishmentName}`,
      body: `Résumé avant rendez-vous :\n- Établissement : ${lead.establishmentName} (${categoryLabel})\n- Ville : ${lead.city ?? "inconnue"}\n- Visite virtuelle existante : ${lead.hasVirtualTour ? "oui" : lead.hasVirtualTour === false ? "non" : "inconnu"}\n- Angle recommandé : ${input.analysis?.recommendedAngle ?? "à définir"}\n- Service recommandé : ${input.analysis?.recommendedService ?? "à définir"}`,
    };
  }

  // PROPOSAL
  return {
    subject: `Proposition commerciale — ${lead.establishmentName}`,
    body: `${greeting}

Suite à notre échange, voici les grandes lignes d'une proposition pour ${lead.establishmentName} : ${input.analysis?.recommendedService ?? "visite virtuelle 360°"}.

${organization.pitch ?? ""}${portfolioLine}

Je reste à votre disposition pour affiner cette offre selon vos besoins.

${signOff}

Se désinscrire : ${unsubscribeUrl}`,
  };
}
