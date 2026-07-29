// Test de bout en bout — isolation multi-tenant (v0.2, voir ADR 0005) :
//   npm run dev &
//   node tests/e2e/two-organizations-isolation.mjs
//
// Crée deux organisations, deux utilisateurs, connecte chacun séparément
// (contextes de navigateur isolés) et vérifie qu'aucun ne voit les données
// (prospects, nom d'organisation) de l'autre. Même style que
// tests/e2e/golden-path.mjs (pas de @playwright/test, assertions simples).
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

function log(step) {
  console.log(`→ ${step}`);
}

async function registerOrganization(page, { organizationName, firstName, lastName, email, password }) {
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { organizationName, firstName, lastName, email, password },
  });
  assert.equal(res.ok(), true, `échec de l'inscription pour ${email}: ${res.status()} ${await res.text()}`);
}

async function createLead(page, establishmentName) {
  const res = await page.request.post(`${BASE_URL}/api/leads`, {
    data: { establishmentName, category: "OTHER" },
  });
  assert.equal(res.ok(), true, `échec de création du prospect "${establishmentName}": ${res.status()} ${await res.text()}`);
  const { lead } = await res.json();
  return lead;
}

async function main() {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });

  const runId = Math.random().toString(36).slice(2, 8);
  const orgA = {
    organizationName: `Isolation Org A ${runId}`,
    firstName: "Alice",
    lastName: "A",
    email: `isolation-a-${runId}@example.test`,
    password: "password1234",
  };
  const orgB = {
    organizationName: `Isolation Org B ${runId}`,
    firstName: "Bob",
    lastName: "B",
    email: `isolation-b-${runId}@example.test`,
    password: "password1234",
  };

  const consoleErrors = [];

  // Deux contextes de navigateur strictement isolés (cookies distincts) —
  // simule deux utilisateurs réels sur deux machines différentes.
  const pageA = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageB = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const p of [pageA, pageB]) {
    p.on("pageerror", (e) => consoleErrors.push(String(e)));
    p.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
  }

  log("création de deux organisations distinctes");
  await registerOrganization(pageA, orgA);
  await registerOrganization(pageB, orgB);

  log("chaque utilisateur crée un prospect dans sa propre organisation");
  const leadA = await createLead(pageA, `Prospect exclusif A ${runId}`);
  const leadB = await createLead(pageB, `Prospect exclusif B ${runId}`);

  log("connexion de chaque utilisateur (déjà authentifié après inscription) et affichage du tableau de bord");
  await pageA.goto(`${BASE_URL}/dashboard`);
  await pageA.waitForSelector("text=Tableau de bord");
  await pageB.goto(`${BASE_URL}/dashboard`);
  await pageB.waitForSelector("text=Tableau de bord");

  log("vérification : chacun voit le nom de sa propre organisation, jamais celui de l'autre");
  const bodyA = await pageA.textContent("body");
  const bodyB = await pageB.textContent("body");
  assert.ok(bodyA.includes(orgA.organizationName), "A doit voir le nom de sa propre organisation");
  assert.ok(!bodyA.includes(orgB.organizationName), "A ne doit jamais voir le nom de l'organisation B");
  assert.ok(bodyB.includes(orgB.organizationName), "B doit voir le nom de sa propre organisation");
  assert.ok(!bodyB.includes(orgA.organizationName), "B ne doit jamais voir le nom de l'organisation A");

  log("vérification : la liste des prospects de A ne contient jamais le prospect de B, et réciproquement");
  await pageA.goto(`${BASE_URL}/leads`);
  await pageA.waitForSelector("table");
  const leadsBodyA = await pageA.textContent("body");
  assert.ok(leadsBodyA.includes(leadA.establishmentName), "A doit voir son propre prospect");
  assert.ok(!leadsBodyA.includes(leadB.establishmentName), "A ne doit jamais voir le prospect de B");

  await pageB.goto(`${BASE_URL}/leads`);
  await pageB.waitForSelector("table");
  const leadsBodyB = await pageB.textContent("body");
  assert.ok(leadsBodyB.includes(leadB.establishmentName), "B doit voir son propre prospect");
  assert.ok(!leadsBodyB.includes(leadA.establishmentName), "B ne doit jamais voir le prospect de A");

  log("vérification directe API : falsifier l'id du prospect de l'autre organisation échoue (404, pas de fuite)");
  const forgedAccess = await pageA.request.get(`${BASE_URL}/api/leads/${leadB.id}`);
  assert.equal(forgedAccess.status(), 404, "un prospect d'une autre organisation ne doit jamais être accessible");

  log("aucune erreur console pendant le parcours");
  assert.deepEqual(consoleErrors, [], `erreurs console inattendues:\n${consoleErrors.join("\n")}`);

  await browser.close();
  console.log("\n✅ Isolation multi-tenant entre deux organisations validée de bout en bout.");
}

main().catch((err) => {
  console.error("\n❌ Échec du test d'isolation multi-tenant:", err);
  process.exit(1);
});
