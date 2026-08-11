import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createGoal, submitClarifyingAnswers } from "@/lib/quest/goal-service";
import { markTooEasy, markTooHard } from "@/lib/quest/quest-service";

/**
 * Couvre le retour terrain : le moteur générait des quêtes de coaching
 * génériques ("Écris en une phrase ce que représente ton objectif", "Liste
 * 3 signes de progression"...) au lieu d'actions concrètes et spécifiques
 * au domaine. Vérifie les 7 objectifs de référence donnés explicitement.
 */

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

// Jamais générées quand l'objectif est déjà suffisamment précis (§ retour terrain).
const GENERIC_PHRASE_BLACKLIST =
  /écris en une phrase concrète et mesurable ce que représente|liste 3 signes qui montreraient|fais une première action réelle \(pas une préparation\)|consacre un vrai créneau concentré|définis la toute première étape, la plus petite possible, pour/i;

type Case = {
  title: string;
  expectedDomain: string;
  /** null = doit agir immédiatement sans question (objectif déjà assez précis pour une première action). */
  levelAnswer: string | null;
  domainKeyword: RegExp;
};

const CASES: Case[] = [
  { title: "Courir 1h à 10 km/h", expectedDomain: "RUNNING", levelAnswer: "Je peux courir environ 5 minutes sans m'arrêter.", domainKeyword: /minutes?/i },
  { title: "Faire 50 pompes", expectedDomain: "STRENGTH", levelAnswer: "Je peux faire 10 pompes d'affilée.", domainKeyword: /pompes/i },
  { title: "Créer mon entreprise", expectedDomain: "BUSINESS", levelAnswer: null, domainKeyword: /client|prospect|offre/i },
  { title: "Trouver 10 clients", expectedDomain: "SALES", levelAnswer: null, domainKeyword: /prospect|client/i },
  { title: "Apprendre l'anglais", expectedDomain: "LANGUAGE", levelAnswer: "Je suis débutant complet.", domainKeyword: /anglais/i },
  { title: "Économiser 5000 €", expectedDomain: "SAVINGS", levelAnswer: "Je peux mettre environ 100 € de côté par mois.", domainKeyword: /€/i },
  { title: "Arrêter de fumer", expectedDomain: "QUIT_HABIT", levelAnswer: "Je fume environ 10 cigarettes par jour.", domainKeyword: /cigarette/i },
];

runIfDatabase("Personal Quest AI — quêtes spécifiques au domaine pour les 7 objectifs de référence", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(suffix: string) {
    const user = await prisma.user.create({
      data: { email: `quest-domain-${suffix}-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return user;
  }

  for (const testCase of CASES) {
    it(`« ${testCase.title} » (${testCase.expectedDomain}) produit des quêtes spécifiques, jamais génériques`, async () => {
      const user = await createUser(testCase.expectedDomain.toLowerCase());
      const created = await createGoal(user.id, { title: testCase.title, description: null });

      let quests: { title: string }[];
      if (testCase.levelAnswer === null) {
        // Objectif déjà assez précis : doit agir immédiatement, jamais de question.
        expect(created.status).toBe("READY");
        if (created.status !== "READY") throw new Error("unreachable");
        quests = created.quests;
      } else {
        // Niveau inconnu et nécessaire : exactement UNE question ciblée, jamais un questionnaire.
        expect(created.status).toBe("NEEDS_ANSWERS");
        if (created.status !== "NEEDS_ANSWERS") throw new Error("unreachable");
        expect(created.clarifyingQuestions).toHaveLength(1);

        const answered = await submitClarifyingAnswers(user.id, created.goal.id, [
          { question: created.clarifyingQuestions[0], answer: testCase.levelAnswer },
        ]);
        expect(answered.status).toBe("READY");
        quests = answered.quests;
      }

      expect(quests.length).toBeGreaterThanOrEqual(1);
      expect(quests.length).toBeLessThanOrEqual(5);

      for (const quest of quests) {
        expect(quest.title).not.toMatch(GENERIC_PHRASE_BLACKLIST);
      }
      expect(quests.some((q) => testCase.domainKeyword.test(q.title))).toBe(true);
    });
  }

  it('"Courir 1h à 10 km/h" — trop facile augmente vers 8-10 minutes, trop difficile bascule en intervalles course/marche', async () => {
    const user = await createUser("running-adaptation");
    const created = await createGoal(user.id, { title: "Courir 1h à 10 km/h", description: null });
    if (created.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");

    const answered = await submitClarifyingAnswers(user.id, created.goal.id, [
      { question: created.clarifyingQuestions[0], answer: "Je peux courir environ 5 minutes sans m'arrêter." },
    ]);
    if (answered.status !== "READY") throw new Error("expected READY");
    const firstQuest = answered.quests[0];
    expect(firstQuest.title).toMatch(/5 minutes/);

    const tooEasyResult = await markTooEasy(user.id, firstQuest.id);
    expect(tooEasyResult.decomposed).toBe(true);
    const harderTitle = tooEasyResult.subQuests[0]?.title ?? "";
    const harderMinutes = Number(harderTitle.match(/(\d+)\s*minutes?/)?.[1]);
    expect(harderMinutes).toBeGreaterThanOrEqual(8);
    expect(harderMinutes).toBeLessThanOrEqual(10);

    // Sur une NOUVELLE quête de départ (5 min), signaler "trop difficile" doit basculer en intervalles.
    const secondGoal = await createGoal(user.id, { title: "Courir 1h à 10 km/h", description: null });
    if (secondGoal.status !== "NEEDS_ANSWERS") throw new Error("expected NEEDS_ANSWERS");
    const secondAnswered = await submitClarifyingAnswers(user.id, secondGoal.goal.id, [
      { question: secondGoal.clarifyingQuestions[0], answer: "Je peux courir environ 5 minutes sans m'arrêter." },
    ]);
    if (secondAnswered.status !== "READY") throw new Error("expected READY");
    const secondQuest = secondAnswered.quests[0];

    const tooHardResult = await markTooHard(user.id, secondQuest.id);
    expect(tooHardResult.decomposed).toBe(true);
    const intervalTitle = tooHardResult.subQuests[0]?.title ?? "";
    expect(intervalTitle).toMatch(/x \(1 minute de course \+ 1 minute de marche\)/);
  });
});
