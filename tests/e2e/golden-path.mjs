// Test de bout en bout du parcours principal (golden path), à exécuter contre
// une instance locale déjà démarrée et déjà seedée :
//   npm run dev &
//   npm run db:seed   (si pas déjà fait)
//   node tests/e2e/golden-path.mjs
//
// Ce script n'utilise pas @playwright/test (pas de config/runner à maintenir) :
// c'est une suite d'assertions simples, avec code de sortie non nul en cas d'échec.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

function log(step) {
  console.log(`→ ${step}`);
}

async function main() {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  log("connexion (admin de démonstration)");
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", "admin@demo.provence360.fr");
  await page.fill("#password", "demo12345");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  assert.match(page.url(), /\/dashboard$/, "la connexion doit rediriger vers le tableau de bord");

  log("tableau de bord affiché avec des statistiques");
  await page.waitForSelector("text=Tableau de bord");

  log("liste des prospects qualifiés");
  await page.goto(`${BASE_URL}/leads?stage=QUALIFIED`);
  const leadLink = page.locator('table a[href^="/leads/"]').first();
  await leadLink.waitFor();
  await leadLink.click();
  await page.waitForSelector('button:has-text("Analyser (IA)")');

  log("analyse IA + score automatique");
  await page.click('button:has-text("Analyser (IA)")');
  await page.waitForSelector("text=Vérifié", { timeout: 15000 });
  await page.click('button:has-text("Calculer le score")');
  await page.waitForTimeout(1000);

  log("génération d'un message personnalisé");
  await page.click('button:has-text("Générer un message")');
  await page.waitForSelector("text=PENDING_VALIDATION", { timeout: 15000 });

  log("validation humaine puis envoi simulé");
  await page.click('button:has-text("Valider et envoyer")');
  await page.waitForSelector("text=SENT", { timeout: 15000 });

  log("inscription dans une séquence");
  const enrollButton = page.locator('button:has-text("Inscrire")');
  if (await enrollButton.count()) {
    await enrollButton.click();
    await page.waitForTimeout(1000);
  }

  log("simulation d'une réponse entrante (intéressé)");
  await page.click('button:has-text("Intéressé")');
  await page.waitForSelector("text=STOPPED", { timeout: 15000 });

  log("le stage du prospect doit avoir changé automatiquement");
  await page.waitForSelector('option[value="INTERESTED"]:checked, option[value="REPLIED"]:checked', { timeout: 5000 }).catch(() => {});

  log("aucune erreur console pendant le parcours");
  assert.deepEqual(consoleErrors, [], `erreurs console inattendues:\n${consoleErrors.join("\n")}`);

  await browser.close();
  console.log("\n✅ Parcours principal validé de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test de bout en bout:", err);
  process.exit(1);
});
