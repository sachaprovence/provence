// Test de bout en bout — onboarding self-service (v1.0, AR-0064/AR-0065) :
//   npm run dev &
//   node tests/e2e/self-service-onboarding.mjs
//
// Vérifie le parcours complet, sans intervention manuelle : inscription
// publique avec choix d'un plan payant → provisionnement automatique de
// l'abonnement (mode démo : activation synchrone) → page de facturation
// affichant le plan et le statut corrects. Même style que
// tests/e2e/golden-path.mjs (pas de @playwright/test, assertions simples).
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
  const suffix = Math.random().toString(36).slice(2, 8);

  log("inscription publique avec choix du plan PRO");
  await page.goto(`${BASE_URL}/register`);
  await page.waitForSelector('input[value="PRO"]', { timeout: 15000 });
  await page.fill("#organizationName", `Org Onboarding ${suffix}`);
  await page.fill("#firstName", "Alice");
  await page.fill("#lastName", "Dupont");
  await page.fill("#email", `alice-onboarding-${suffix}@test.fr`);
  await page.fill("#password", "password1234");
  await page.click('input[value="PRO"]');
  await page.click("button[type=submit]");

  log("redirection automatique vers /onboarding (sans intervention manuelle)");
  await page.waitForURL("**/onboarding", { timeout: 15000 });

  log("l'abonnement PRO est actif immédiatement (fournisseur démo synchrone)");
  await page.goto(`${BASE_URL}/settings/billing`);
  await page.waitForSelector("text=Plan actuel", { timeout: 10000 });
  const bodyText = await page.textContent("body");
  assert.match(bodyText, /Pro/i, "le plan PRO doit apparaître comme plan actuel");
  assert.match(bodyText, /Actif/, "le statut de l'abonnement doit être Actif");

  log("changement de plan depuis l'interface de facturation");
  const enterpriseRow = page.locator("div.flex.items-center.justify-between", { hasText: "Entreprise" });
  await enterpriseRow.locator('button:has-text("Choisir")').click();
  await page.waitForTimeout(1000);
  const bodyAfterChange = await page.textContent("body");
  assert.match(bodyAfterChange, /Plan actuel/, "un plan doit rester marqué comme actuel après le changement");
  const proRowAfterChange = page.locator("div.flex.items-center.justify-between", { hasText: "Pro" });
  await assert.rejects(
    proRowAfterChange.locator("text=Plan actuel").waitFor({ timeout: 2000 }),
    "le plan Pro ne doit plus être marqué comme actuel après le passage à Entreprise"
  );

  await browser.close();
  console.log("\n✅ Parcours d'onboarding self-service validé de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test de bout en bout:", err);
  process.exit(1);
});
