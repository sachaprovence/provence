import "server-only";
import { createPromptVersion, listPromptVersions } from "@/lib/agents/prompts/prompt-engine";

/**
 * Prompts par défaut de l'Agent Commercial — créés une seule fois (version
 * 1) si la clé n'a encore aucune version, jamais réécrits ensuite : une
 * fois qu'un opérateur a créé une nouvelle version via
 * `createPromptVersion`/`activatePromptVersion`, ce seed ne doit plus
 * l'écraser au redémarrage. Voir ADR 0016.
 */
const COMMERCIAL_PROMPT_SEEDS = [
  {
    key: "commercial.draft_email",
    name: "Premier email de prise de contact",
    description: "Génère le corps d'un premier email personnalisé à destination d'un prospect.",
    category: "commercial",
    variables: ["companyName", "sector", "contactName"],
    template:
      "Rédige un premier email de prise de contact, professionnel, chaleureux et personnalisé, pour l'entreprise {{companyName}} (secteur : {{sector}}), à l'attention de {{contactName}}. Reste concis (150 mots maximum) et termine par une proposition d'échange téléphonique.",
  },
  {
    key: "commercial.draft_followup",
    name: "Relance",
    description: "Génère une relance après un premier contact resté sans réponse.",
    category: "commercial",
    variables: ["companyName", "previousSummary"],
    template:
      "Rédige une relance courte et cordiale pour {{companyName}}, en référence au contexte suivant : {{previousSummary}}. Ne sois pas insistant, propose une nouvelle date d'échange.",
  },
  {
    key: "commercial.draft_proposal",
    name: "Proposition commerciale",
    description: "Génère l'argumentaire d'une proposition commerciale.",
    category: "commercial",
    variables: ["companyName", "sector", "potential"],
    template:
      "Rédige un argumentaire de proposition commerciale pour {{companyName}} (secteur : {{sector}}, potentiel estimé : {{potential}}). Structure en 3 points : contexte, valeur apportée, prochaine étape.",
  },
  {
    key: "commercial.recommend_next_actions",
    name: "Recommandation de prochaine action",
    description: "Recommande la prochaine action pour un prospect donné, avec justification.",
    category: "commercial",
    variables: ["companyName", "stage", "score"],
    template:
      "Le prospect {{companyName}} est actuellement à l'étape \"{{stage}}\" avec un score de {{score}}/100. Recommande la prochaine action commerciale la plus pertinente et justifie ce choix en une phrase.",
  },
  {
    key: "commercial.estimate_potential",
    name: "Estimation du potentiel",
    description: "Produit une justification qualitative de l'estimation du potentiel d'un prospect.",
    category: "commercial",
    variables: ["companyName", "sector", "companySize"],
    template:
      "Explique en 2 phrases pourquoi {{companyName}} (secteur : {{sector}}, taille : {{companySize}}) représente un potentiel commercial pour nous, sans donner de chiffre précis (le chiffre est calculé séparément).",
  },
] as const;

export async function ensureCommercialPromptSeeds() {
  for (const seed of COMMERCIAL_PROMPT_SEEDS) {
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
