// Parcours principal du module Compta Vellano (comptabilité pizzeria), à
// exécuter contre une instance locale déjà démarrée et déjà seedée :
//   npm run dev &
//   npm run db:seed   (si pas déjà fait)
//   node tests/e2e/golden-path-compta-vellano.mjs
//
// Même convention que tests/e2e/golden-path.mjs : pas de @playwright/test,
// une suite d'assertions simples, code de sortie non nul en cas d'échec.
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

  log("tableau de bord Compta Vellano accessible depuis la navigation");
  await page.goto(`${BASE_URL}/compta`);
  await page.waitForSelector("text=Compta Vellano");
  await page.waitForSelector("text=Solde bancaire");

  log("création d'un produit");
  await page.goto(`${BASE_URL}/compta/produits`);
  await page.click('text=Nouveau produit');
  const productForm = page.locator("form");
  const productInputs = productForm.locator("input");
  await productInputs.nth(0).fill("Margherita E2E");
  await productInputs.nth(1).fill("Pizza");
  await productInputs.nth(2).fill("9.50");
  await page.click('button:has-text("Ajouter le produit")');
  await page.waitForSelector("text=Margherita E2E");

  log("enregistrement d'une vente en moins de quelques clics (parcours \"3 minutes\")");
  await page.goto(`${BASE_URL}/compta/ventes/nouvelle`);
  const productSelect = page.locator("main select").nth(1);
  await productSelect.selectOption({ label: "Margherita E2E" });
  await page.click('button:has-text("Enregistrer la vente")');
  await page.waitForURL("**/compta/ventes", { timeout: 15000 });
  await page.waitForSelector("text=Margherita E2E");

  log("le tableau de bord reflète la vente (CA du jour, dernières opérations)");
  await page.goto(`${BASE_URL}/compta`);
  await page.waitForSelector("text=9,50");
  await page.waitForSelector("text=Vente");

  log("ajout d'une dépense et calcul automatique de la TVA récupérable");
  await page.goto(`${BASE_URL}/compta/depenses/nouvelle`);
  const expenseForm = page.locator("form");
  await expenseForm.locator('input[type="number"]').nth(0).fill("25.00");
  await expenseForm.locator('input[required]:not([type="date"]):not([type="number"])').fill("Farine E2E");
  await page.click('button:has-text("Ajouter la dépense")');
  await page.waitForURL("**/compta/depenses", { timeout: 15000 });
  await page.waitForSelector("text=Farine E2E");
  await page.waitForSelector("text=4,17");

  log("l'écran TVA agrège la TVA collectée et déductible du mois en cours");
  await page.goto(`${BASE_URL}/compta/tva`);
  await page.waitForSelector("text=TVA à payer (mois en cours)");

  log("le comptage de caisse calcule l'écart avec la caisse théorique");
  await page.goto(`${BASE_URL}/compta/caisse`);
  await page.waitForSelector("text=Écart");

  log("les fonctionnalités non livrées (scanner, assistant IA) affichent un état \"bientôt disponible\", pas une erreur");
  await page.goto(`${BASE_URL}/compta/scanner`);
  await page.waitForSelector("text=Bientôt disponible");
  await page.goto(`${BASE_URL}/compta/assistant`);
  await page.waitForSelector("text=Bientôt disponible");

  log("aucune erreur console pendant le parcours");
  assert.deepEqual(consoleErrors, [], `erreurs console inattendues:\n${consoleErrors.join("\n")}`);

  await browser.close();
  console.log("\n✅ Parcours Compta Vellano validé de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test de bout en bout Compta Vellano:", err);
  process.exit(1);
});
