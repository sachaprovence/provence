import "server-only";
import { createPromptVersion, listPromptVersions } from "@/lib/agents/prompts/prompt-engine";

/**
 * Prompts par défaut des 7 agents métier v0.9 (Prospection, Relance,
 * Devis, Planning, Réseaux sociaux, Support, Analyse) — même convention
 * que `commercial/prompt-seeds.ts` (v0.5) : créés une seule fois (version
 * 1), jamais réécrits après qu'un opérateur en a créé une nouvelle
 * version. Voir ADR 0016.
 */
const BUSINESS_AGENT_PROMPT_SEEDS = [
  {
    key: "prospection.draft_outreach",
    name: "Premier contact (Agent Prospection)",
    description: "Génère un message de prise de contact pour un prospect prioritaire.",
    category: "prospection",
    variables: ["establishmentName", "category", "city"],
    template:
      "Rédige un premier message de prise de contact, professionnel et personnalisé, pour l'établissement {{establishmentName}} ({{category}}, {{city}}). Présente Provence 360 et propose une visite virtuelle 360°. Reste concis (120 mots maximum).",
  },
  {
    key: "relance.draft_followup",
    name: "Relance (Agent Relance)",
    description: "Génère une relance pour un prospect resté sans réponse.",
    category: "relance",
    variables: ["establishmentName", "stage", "daysSinceLastContact"],
    template:
      "Rédige une relance courte et cordiale pour {{establishmentName}}, actuellement à l'étape \"{{stage}}\", sans réponse depuis {{daysSinceLastContact}} jours. Ne sois pas insistant, propose une nouvelle date d'échange.",
  },
  {
    key: "devis.recommend_pricing",
    name: "Recommandation tarifaire (Agent Devis)",
    description: "Recommande une approche tarifaire pour un prospect donné.",
    category: "devis",
    variables: ["establishmentName", "category", "score"],
    template:
      "Le prospect {{establishmentName}} ({{category}}) a un score de {{score}}/100. Recommande en 2 phrases une approche tarifaire adaptée (remise éventuelle, mise en avant d'une offre) sans donner de montant précis.",
  },
  {
    key: "social.draft_post",
    name: "Publication réseaux sociaux (Agent Réseaux sociaux)",
    description: "Génère un texte de publication pour annoncer une visite virtuelle publiée.",
    category: "social",
    variables: ["establishmentName", "category", "tourUrl"],
    template:
      "Rédige une publication courte et engageante pour les réseaux sociaux annonçant la nouvelle visite virtuelle 360° de {{establishmentName}} ({{category}}). Inclus un appel à l'action vers {{tourUrl}}. Maximum 280 caractères, ton chaleureux.",
  },
  {
    key: "support.summarize_conversation",
    name: "Résumé de conversation (Agent Support)",
    description: "Résume l'historique d'échanges avec un prospect/client.",
    category: "support",
    variables: ["establishmentName", "messageCount"],
    template: "Résume en 3 phrases maximum l'historique des {{messageCount}} échanges avec {{establishmentName}}, en mettant en avant les points d'attention pour la suite.",
  },
  {
    key: "support.draft_reply",
    name: "Réponse (Agent Support)",
    description: "Rédige une réponse à un message entrant récent.",
    category: "support",
    variables: ["establishmentName", "lastMessageBody"],
    template:
      "{{establishmentName}} a envoyé le message suivant : \"{{lastMessageBody}}\". Rédige une réponse professionnelle, utile et concise.",
  },
  {
    key: "analyse.generate_report",
    name: "Rapport d'activité (Agent Analyse)",
    description: "Génère un résumé exécutif de l'activité commerciale sur une période.",
    category: "analyse",
    variables: ["newLeads", "customersWon", "revenueGenerated", "conversionRate"],
    template:
      "Rédige un résumé exécutif en 3-4 phrases de l'activité de l'entreprise : {{newLeads}} nouveaux prospects, {{customersWon}} clients gagnés, {{revenueGenerated}}€ de chiffre d'affaires généré, taux de conversion de {{conversionRate}}%. Mets en avant une observation clé et une recommandation.",
  },
] as const;

export async function ensureBusinessAgentPromptSeeds() {
  for (const seed of BUSINESS_AGENT_PROMPT_SEEDS) {
    const existingVersions = await listPromptVersions(seed.key);
    if (existingVersions.length > 0) continue;

    await createPromptVersion({
      key: seed.key,
      name: seed.name,
      description: seed.description,
      category: seed.category,
      template: seed.template,
      variables: [...seed.variables],
    });
  }
}
