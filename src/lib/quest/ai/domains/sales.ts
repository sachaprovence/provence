import "server-only";
import type { DomainHandler, DomainQuestDraft } from "../goal-domain";
import { firstNumber } from "../goal-domain";

/**
 * Prospection commerciale ("Trouver 10 clients", "Obtenir 5 clients"...) —
 * construire une liste puis contacter est pertinent quel que soit le niveau
 * commercial de l'utilisateur : pas de question de niveau bloquante.
 */

function targetCountFrom(title: string, description: string | null): number {
  return firstNumber(`${title} ${description ?? ""}`) ?? 10;
}

const MILESTONE_TITLES = (target: number) => [
  "Identifier précisément ton client idéal",
  `Constituer une liste de ${Math.max(20, target * 3)} prospects qualifiés`,
  `Contacter tes ${target} premiers prospects`,
  "Décrocher 3 rendez-vous ou échanges qualifiés",
  `Signer tes ${target} premiers clients`,
];

const QUEST_TEMPLATES: ((target: number) => DomainQuestDraft[])[] = [
  () => [
    {
      title: "Décris en une phrase le profil exact de ton client idéal : secteur, taille, besoin précis.",
      description: null,
      why: "Un profil clair permet de reconnaître un bon prospect en quelques secondes, plutôt que de contacter au hasard.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 1,
      impactWeight: 1,
    },
  ],
  (target) => [
    {
      title: `Liste ${Math.max(20, target * 3)} entreprises ou personnes qui correspondent à ce profil, avec un moyen de les contacter (email, téléphone, réseau).`,
      description: null,
      why: "Une liste de prospection est le carburant de toute démarche commerciale — sans elle, rien à contacter.",
      type: "NORMAL",
      estimatedMinutes: 45,
      difficulty: 2,
      impactWeight: 1.2,
    },
  ],
  (target) => [
    {
      title: `Envoie un message personnalisé (pas un copier-coller) à tes ${target} premiers prospects de la liste.`,
      description: null,
      why: "Un message personnalisé a un taux de réponse nettement supérieur à un message générique.",
      type: "NORMAL",
      estimatedMinutes: 40,
      difficulty: 3,
      impactWeight: 1.4,
    },
  ],
  () => [
    {
      title: "Relance sous 3 jours chaque prospect qui n'a pas répondu, avec une question simple et directe.",
      description: null,
      why: "La majorité des rendez-vous obtenus viennent d'une relance, pas du premier message.",
      type: "SHORT",
      estimatedMinutes: 20,
      difficulty: 2,
      impactWeight: 1.6,
    },
  ],
  (target) => [
    {
      title: `Fais une proposition concrète à chaque prospect intéressé, jusqu'à signer ${target} clients.`,
      description: null,
      why: "Transformer l'intérêt en signature demande une offre claire, pas seulement une bonne conversation.",
      type: "NORMAL",
      estimatedMinutes: 40,
      difficulty: 3,
      impactWeight: 2,
    },
  ],
];

export const salesDomain: DomainHandler = {
  domain: "SALES",

  matches(title, description) {
    return /\bclients?\b|\bprospects?\b|\bprospection\b/i.test(`${title} ${description ?? ""}`) && /trouver|obtenir|décrocher|signer|acquérir/i.test(title);
  },

  hasEnoughInfo() {
    // Construire une liste puis contacter a du sens qu'on parte de zéro ou non.
    return true;
  },

  levelQuestion() {
    return "As-tu déjà des clients aujourd'hui, ou pars-tu de zéro ?";
  },

  parseLevelAnswer(_title, _description, rawAnswer) {
    return `Situation commerciale actuelle déclarée : ${rawAnswer.trim()}`;
  },

  buildMilestones(ctx) {
    const target = targetCountFrom(ctx.title, ctx.description);
    return MILESTONE_TITLES(target).map((title, i) => ({
      title,
      description: null,
      weight: Math.round((0.6 + i * 0.4) * 100) / 100,
    }));
  },

  buildQuestsForMilestone(ctx, milestone, count) {
    const target = targetCountFrom(ctx.title, ctx.description);
    const index = Math.max(0, Math.min(QUEST_TEMPLATES.length - 1, milestone.order));
    return QUEST_TEMPLATES[index](target).slice(0, Math.max(1, count));
  },

  adjustQuest(previousQuestTitle, direction) {
    if (direction === "HARDER") {
      return {
        title: "Contacte 10 nouveaux prospects aujourd'hui, et propose directement un rendez-vous plutôt qu'un simple échange par message.",
        description: null,
        why: "Plus de volume et une demande plus directe accélèrent le cycle de vente.",
        type: "NORMAL",
        estimatedMinutes: 45,
        difficulty: 3,
        impactWeight: 1.3,
      };
    }
    return {
      title: `Avant de recontacter qui que ce soit, prépare un message type de 3 phrases (qui tu es, à qui tu t'adresses, ce que tu proposes). Base-toi sur : ${previousQuestTitle.replace(/[.!?]+$/, "")}.`,
      description: null,
      why: "Préparer un message type réduit la charge quand la prospection à froid bloque.",
      type: "MICRO",
      estimatedMinutes: 15,
      difficulty: 1,
      impactWeight: 0.8,
    };
  },
};
