import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";

/**
 * Création d'entreprise / activité — les toutes premières actions (définir
 * le client, valider le besoin, prospecter) sont pertinentes quel que soit
 * le niveau d'expérience de l'utilisateur : jamais de question de niveau
 * bloquante ici (§ principe central : agir dès qu'on a assez d'info).
 */

function extractNiche(title: string, description: string | null): string | null {
  const text = `${title} ${description ?? ""}`;
  const match = text.match(/entreprise\s+d[e'](?:une?\s+)?([a-zà-ÿ0-9\s]{3,40}?)(?:[.,!?]|$)/i);
  return match ? match[1].trim() : null;
}

const MILESTONE_TITLES = (niche: string | null) => [
  `Définir précisément le client que ${niche ? `ton offre de ${niche}` : "ton offre"} doit aider`,
  "Valider que ce besoin est réel auprès de vrais prospects",
  "Obtenir 3 rendez-vous ou échanges qualifiés",
  "Signer ton premier client",
  "Atteindre 1 000 € de chiffre d'affaires",
];

const QUEST_TEMPLATES: ((niche: string | null) => DomainQuestDraft[])[] = [
  (niche) => [
    {
      title: `Décris en une phrase précise le type de client que tu veux aider${niche ? ` avec ${niche}` : ""}, et le problème exact que tu résous pour lui.`,
      description: null,
      why: "Une cible floue rend toute prospection inefficace — cette phrase doit être assez précise pour reconnaître ce client dans la rue.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 1,
      impactWeight: 1,
    },
    {
      title: "Liste 5 entreprises ou personnes précises qui correspondent exactement à ce profil de client.",
      description: null,
      why: "Une liste concrète transforme une idée en cibles réelles que tu peux contacter dès demain.",
      type: "SHORT",
      estimatedMinutes: 25,
      difficulty: 1,
      impactWeight: 1,
    },
  ],
  () => [
    {
      title: "Contacte 3 prospects de ta liste et pose-leur une seule question : comment gèrent-ils ce problème aujourd'hui ?",
      description: null,
      why: "Valider le besoin AVANT de construire l'offre évite de développer quelque chose que personne ne veut.",
      type: "NORMAL",
      estimatedMinutes: 40,
      difficulty: 3,
      impactWeight: 1.3,
    },
  ],
  () => [
    {
      title: "Envoie une proposition concrète (offre + prix) à tes prospects les plus intéressés.",
      description: null,
      why: "Un rendez-vous qualifié rapproche directement du premier client.",
      type: "NORMAL",
      estimatedMinutes: 45,
      difficulty: 3,
      impactWeight: 1.6,
    },
  ],
  () => [
    {
      title: "Relance chaque prospect qui n'a pas répondu sous 48h, avec un message court et direct.",
      description: null,
      why: "La majorité des ventes se font après une relance, pas au premier contact.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 2,
      impactWeight: 1.8,
    },
  ],
  () => [
    {
      title: "Demande à ton premier client un retour honnête et une recommandation vers une autre personne.",
      description: null,
      why: "Une recommandation est souvent plus efficace qu'une prospection à froid pour trouver les suivants.",
      type: "NORMAL",
      estimatedMinutes: 30,
      difficulty: 2,
      impactWeight: 2,
    },
  ],
];

export const businessDomain: DomainHandler = {
  domain: "BUSINESS",

  matches(title, description) {
    return /entreprise|business|startup|créer\s+(?:ma|mon|une)\s+(?:société|boîte|activité)/i.test(`${title} ${description ?? ""}`);
  },

  hasEnoughInfo() {
    // Les premières actions (définir le client, valider le besoin) ont du sens quel que soit le niveau d'expérience.
    return true;
  },

  levelQuestion() {
    return "As-tu déjà une idée précise de l'offre que tu veux vendre, ou faut-il d'abord la définir ?";
  },

  parseLevelAnswer(_title, _description, rawAnswer) {
    return `Niveau de préparation de l'offre déclaré : ${rawAnswer.trim()}`;
  },

  buildMilestones(ctx) {
    const niche = extractNiche(ctx.title, ctx.description);
    return MILESTONE_TITLES(niche).map((title, i) => ({
      title,
      description: null,
      weight: Math.round((0.7 + i * 0.4) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const niche = extractNiche(ctx.title, ctx.description);
    const index = Math.max(0, Math.min(QUEST_TEMPLATES.length - 1, milestone.order));
    return QUEST_TEMPLATES[index](niche).slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    if (direction === "HARDER") {
      return {
        title: "Contacte 5 nouveaux prospects aujourd'hui au lieu de 3, en visant directement une proposition plutôt qu'un simple échange.",
        description: null,
        why: "Augmenter le volume de contacts accélère mécaniquement le nombre de signatures.",
        type: "NORMAL",
        estimatedMinutes: 45,
        difficulty: 3,
        impactWeight: 1.3,
      };
    }
    return {
      title: `Avant de recontacter qui que ce soit, prépare simplement 3 phrases : qui tu aides, quel problème tu résous, et ta première offre concrète. Base-toi sur : ${previousQuestTitle.replace(/[.!?]+$/, "")}.`,
      description: null,
      why: "Repartir de la préparation plutôt que de l'action réduit la charge quand le contact direct bloque.",
      type: "MICRO",
      estimatedMinutes: 15,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
