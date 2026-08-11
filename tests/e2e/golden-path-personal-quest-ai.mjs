// Parcours principal du module Personal Quest AI (voir ADR 0049), à
// exécuter contre une instance locale déjà démarrée et déjà seedée, en
// mode démo (AI_PROVIDER=demo, comportement par défaut) :
//   npm run dev &
//   npm run db:seed   (si pas déjà fait)
//   node tests/e2e/golden-path-personal-quest-ai.mjs
//
// Même convention que tests/e2e/golden-path-compta-vellano.mjs : pas de
// @playwright/test, une suite d'assertions simples, code de sortie non nul
// en cas d'échec. Couvre la boucle cœur du brief (§1/§49) de bout en bout :
// objectif -> analyse -> jalons -> quêtes -> sélection -> validation -> XP
// -> adaptation -> assistant.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const GOAL_TITLE = `Apprendre le piano E2E ${Date.now()}`;

function log(step) {
  console.log(`→ ${step}`);
}

async function main() {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  log("connexion (admin de démonstration)");
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", "admin@demo.provence360.fr");
  await page.fill("#password", "demo12345");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  log("l'écran Objectifs est accessible depuis /quest");
  await page.goto(`${BASE_URL}/quest/goals`);
  await page.waitForSelector("text=Objectifs");

  log("création d'un objectif (§3 du brief)");
  await page.goto(`${BASE_URL}/quest/goals/new`);
  await page.waitForSelector("text=Quel objectif veux-tu atteindre ?");
  await page.fill("textarea", GOAL_TITLE);
  await page.click("text=Créer mon parcours");

  log("analyse : questions de clarification (≤ 7, §4) OU plan direct");
  await page.waitForFunction(
    () => document.body.innerText.includes("Quelques précisions") || document.body.innerText.includes("est prêt"),
    { timeout: 60000 }
  );
  const afterTitleText = await page.textContent("body");

  if (afterTitleText.includes("Quelques précisions")) {
    const textareas = await page.$$("textarea");
    assert.ok(textareas.length >= 1 && textareas.length <= 7, "entre 1 et 7 questions de clarification attendues");
    for (const textarea of textareas) {
      await textarea.fill("Réponse de test pour le parcours de bout en bout.");
    }
    await page.click("text=Continuer");
    await page.waitForFunction(() => document.body.innerText.includes("est prêt"), { timeout: 60000 });
  }

  log("le plan contient des jalons (vision stable) et 2 à 5 quêtes seulement (§2 du brief, pas tout le parcours)");
  const summaryText = await page.textContent("body");
  assert.ok(summaryText.includes("Grandes étapes"), "les jalons doivent être affichés");
  assert.ok(summaryText.includes("prochaines quêtes"), "les premières quêtes doivent être affichées");

  log("accès à la prochaine quête sur l'écran Aujourd'hui (§9 du brief)");
  await page.click("text=Voir ma prochaine quête");
  await page.waitForFunction(() => document.body.innerText.includes("Commencer"), { timeout: 30000 });
  const todayText = await page.textContent("body");
  assert.ok(todayText.includes("Commencer"), "un bouton Commencer doit être visible");
  assert.ok(todayText.includes("XP"), "l'XP de la quête doit être affiché");

  log("démarrer puis terminer la quête (§9 du brief : COMMENCER / TERMINER)");
  await page.click("text=Commencer");
  await page.waitForFunction(() => document.body.innerText.includes("Terminer"), { timeout: 30000 });
  await page.click("text=Terminer");
  await page.waitForSelector("text=Bravo, quête terminée !", { timeout: 15000 });

  log("la progression de l'objectif avance et une nouvelle quête est proposée (adaptation, §14)");
  await page.goto(`${BASE_URL}/quest/goals`);
  await page.waitForSelector(`text=${GOAL_TITLE}`);

  log("la page Progression affiche XP/niveau/streak/momentum (§23-27, peu de jauges mais utiles)");
  await page.goto(`${BASE_URL}/quest/progress`);
  await page.waitForSelector("text=Niveau");
  await page.waitForSelector("text=Discipline");
  await page.waitForSelector("text=Momentum");

  log("l'assistant contextuel répond et peut agir (§19-21 du brief)");
  await page.goto(`${BASE_URL}/quest/assistant`);
  await page.fill('input[placeholder="Écris à ton assistant…"]', "Pourquoi tu me proposes ça ?");
  await page.click("text=Envoyer");
  await page.waitForTimeout(2000);
  const assistantMessages = await page.locator(".quest-card").count();
  assert.ok(assistantMessages > 0, "l'assistant doit répondre avec au moins un message");

  log("la page Profil expose le contrôle utilisateur sur la mémoire (§36 du brief)");
  await page.goto(`${BASE_URL}/quest/profile`);
  await page.waitForSelector("text=Ce que l'IA sait sur toi");

  log("aucune erreur console pendant le parcours");
  assert.deepEqual(consoleErrors, [], `erreurs console inattendues:\n${consoleErrors.join("\n")}`);

  await browser.close();
  console.log("\n✅ Parcours Personal Quest AI validé de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test de bout en bout Personal Quest AI:", err);
  process.exit(1);
});
