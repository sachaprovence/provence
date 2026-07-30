// Test de bout en bout de l'Automation Engine (v0.8) :
//   npm run dev &
//   node tests/e2e/automation-golden-path.mjs
//
// Crée une organisation fraîche, une automatisation linéaire (trigger manuel
// -> action "notification.create" -> fin), l'active, la déclenche via l'API,
// fait avancer le noyau de jobs via le cron applicatif (comme le ferait
// l'infrastructure de cron en production), puis vérifie dans le navigateur
// que le run apparaît "SUCCEEDED" avec son job, et que le tableau de bord et
// la Dead Letter Queue s'affichent sans erreur. Même style que
// tests/e2e/golden-path.mjs / two-organizations-isolation.mjs (pas de
// @playwright/test, assertions simples).
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

  const runId = Math.random().toString(36).slice(2, 8);
  const org = {
    organizationName: `Automation E2E ${runId}`,
    firstName: "Ada",
    lastName: "Automation",
    email: `automation-e2e-${runId}@example.test`,
    password: "password1234",
  };

  log("inscription d'une organisation fraîche (authentifie automatiquement la session)");
  const registerRes = await page.request.post(`${BASE_URL}/api/auth/register`, { data: org });
  assert.equal(registerRes.ok(), true, `échec de l'inscription: ${registerRes.status()} ${await registerRes.text()}`);

  log("création d'une automatisation linéaire (déclencheur manuel -> notification -> fin)");
  const graph = {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
      { id: "a1", type: "action", position: { x: 0, y: 100 }, data: { jobType: "notification.create", input: { title: `E2E ${runId}` } } },
      { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1" },
      { id: "e2", source: "a1", target: "end1" },
    ],
  };
  const createRes = await page.request.post(`${BASE_URL}/api/automations`, {
    data: { key: `e2e-linear-${runId}`, name: `E2E Linéaire ${runId}`, category: "test", graph },
  });
  assert.equal(createRes.ok(), true, `échec de la création: ${createRes.status()} ${await createRes.text()}`);
  const { automation, version } = await createRes.json();

  log("activation de la version");
  const activateRes = await page.request.post(`${BASE_URL}/api/automations/${automation.id}/activate`, {
    data: { versionId: version.id },
  });
  assert.equal(activateRes.ok(), true, `échec de l'activation: ${activateRes.status()} ${await activateRes.text()}`);

  log("déclenchement manuel");
  const runRes = await page.request.post(`${BASE_URL}/api/automations/${automation.id}/run`, { data: {} });
  assert.equal(runRes.ok(), true, `échec du déclenchement: ${runRes.status()} ${await runRes.text()}`);
  const { run } = await runRes.json();

  log("avancée du noyau de jobs via le cron applicatif jusqu'au succès du run");
  let finalStatus = run.status;
  for (let attempt = 0; attempt < 10 && !["SUCCEEDED", "FAILED"].includes(finalStatus); attempt += 1) {
    await page.request.post(`${BASE_URL}/api/cron/process-automations`);
    const detailRes = await page.request.get(`${BASE_URL}/api/automations/runs/${run.id}`);
    assert.equal(detailRes.ok(), true, `échec de la consultation du run: ${detailRes.status()}`);
    const detail = await detailRes.json();
    finalStatus = detail.run.status;
    if (finalStatus !== "SUCCEEDED" && finalStatus !== "FAILED") await page.waitForTimeout(200);
  }
  assert.equal(finalStatus, "SUCCEEDED", `le run doit atteindre SUCCEEDED (statut final observé : ${finalStatus})`);

  log("le run apparaît SUCCEEDED avec son job dans l'interface");
  await page.goto(`${BASE_URL}/automations/runs/${run.id}`);
  await page.waitForSelector("text=SUCCEEDED");
  await page.waitForSelector("text=notification.create");

  log("le tableau de bord des automatisations s'affiche");
  await page.goto(`${BASE_URL}/automations`);
  await page.waitForSelector("text=Automatisations");
  const dashboardBody = await page.textContent("body");
  assert.ok(dashboardBody.includes(automation.name), "le tableau de bord doit lister l'automatisation créée");

  log("la Dead Letter Queue s'affiche sans erreur");
  await page.goto(`${BASE_URL}/automations/dlq`);
  await page.waitForSelector("text=Dead Letter Queue");

  log("aucune erreur console pendant le parcours");
  assert.deepEqual(consoleErrors, [], `erreurs console inattendues:\n${consoleErrors.join("\n")}`);

  await browser.close();
  console.log("\n✅ Parcours de l'Automation Engine validé de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test de bout en bout de l'Automation Engine:", err);
  process.exit(1);
});
