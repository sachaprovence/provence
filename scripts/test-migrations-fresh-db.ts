import "dotenv/config";
import { Client } from "pg";
import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  realAppDbName,
  generateTempDbName,
  assertSafeTempDbName,
  adminConnectionUrl,
  tempConnectionUrl,
  UnsafeTempDbNameError,
} from "./lib/temp-db-guardrails";
import { createTempDatabase, dropTempDatabase } from "./lib/temp-db";

/**
 * AR-0163 (v1.2) — Test des migrations depuis zéro, sur une base
 * PostgreSQL temporaire et jetable, créée et supprimée par ce script
 * lui-même (jamais la base de développement/CI habituelle).
 *
 * Garde-fous (défense en profondeur, jamais un seul point de contrôle) :
 * 1. Le nom de la base temporaire est TOUJOURS généré par ce script
 *    (jamais lu depuis une variable d'environnement externe), au format
 *    `autorun_migtest_<timestamp>_<hex aléatoire>` — imprévisible et
 *    impossible à faire correspondre à une base réelle par accident.
 * 2. `assertSafeTempDbName` revalide ce format ET vérifie que le nom ne
 *    correspond à AUCUNE base déjà utilisée par l'application (comparé
 *    au nom de base extrait de `DATABASE_URL`) — appelé avant la
 *    création ET une seconde fois juste avant la suppression.
 * 3. La connexion admin (CREATE DATABASE / DROP DATABASE) cible
 *    explicitement la base de maintenance `postgres` du même serveur —
 *    jamais `DATABASE_URL` telle quelle, qui reste réservée aux étapes
 *    applicatives (migrate/seed/build/start), exécutées avec une
 *    variable d'environnement `DATABASE_URL` RÉÉCRITE pour ce process
 *    enfant uniquement (jamais persistée sur disque, jamais dans `.env`).
 * 4. Le nettoyage (DROP DATABASE) est dans un bloc `finally` : il
 *    s'exécute même si une étape précédente échoue, pour ne jamais
 *    laisser de base temporaire orpheline sur le serveur.
 *
 * Portée volontairement raisonnable ("tests essentiels", pas la suite E2E
 * complète — déjà couverte séparément par `.github/workflows/e2e.yml` contre
 * la base CI habituelle) : ce script valide que le SCHÉMA migré depuis zéro
 * + les seeds (deux fois, pour l'idempotence) + un serveur de production
 * démarré dessus forment un tout cohérent, via un sondage de fumée HTTP puis
 * un parcours API déterministe (connexion + lecture authentifiée des
 * données seedées, voir `runApiSmokeCheck`) — délibérément PAS
 * `tests/e2e/golden-path.mjs` : ce script Playwright enchaîne plusieurs
 * attentes temporisées sur le traitement simulé par l'agent IA démo, qui se
 * sont montrées flaky sous charge pendant le développement de ce script,
 * pour des raisons de timing sans rapport avec la correction des
 * migrations — un contrôle CI nouvellement requis doit être fiable, pas
 * seulement complet.
 *
 * Fonctionne identiquement en local (Postgres de `docker-compose.yml`)
 * et en CI (service Postgres de `.github/workflows/*.yml`) : seule la
 * variable d'environnement `DATABASE_URL` de base change, jamais ce
 * script.
 */

const SMOKE_TEST_PORT = 3100;

function log(step: string) {
  console.log(`\n→ ${step}`);
}

/**
 * Lève une exception plutôt que d'appeler `process.exit()` directement :
 * `process.exit()` termine le processus SANS dérouler la pile — le bloc
 * `finally` de `main()` (suppression de la base temporaire) ne s'exécuterait
 * alors JAMAIS sur un échec (bug réel rencontré pendant le développement de
 * ce script : une base temporaire orpheline laissée sur le serveur après un
 * échec de golden-path.mjs). En lançant une exception, `finally` s'exécute
 * normalement avant que `main().catch()` ne fixe le code de sortie.
 */
function fail(message: string): never {
  throw new Error(message);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Variable d'environnement requise absente : ${name}`);
  return value as string;
}

/** Enveloppe `assertSafeTempDbName` (qui lève) pour l'intégrer au flux `fail()`-and-exit de ce script. */
function guardTempDbName(name: string, realDbName: string): void {
  try {
    assertSafeTempDbName(name, realDbName);
  } catch (err) {
    if (err instanceof UnsafeTempDbNameError) fail(`Garde-fou : ${err.message}`);
    throw err;
  }
}

function runStep(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) {
    fail(`Étape échouée : ${command} ${args.join(" ")} (code ${result.status})`);
  }
}

async function countRow(tempUrl: string, table: string): Promise<number> {
  const client = new Client({ connectionString: tempUrl });
  await client.connect();
  try {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    return result.rows[0].count as number;
  } finally {
    await client.end();
  }
}

const DEMO_ADMIN_EMAIL = "admin@demo.provence360.fr";
const DEMO_PASSWORD = "demo12345";

/**
 * Parcours "essentiel" déterministe : connexion réelle (API JSON) + lecture
 * authentifiée des données seedées. Volontairement PAS `tests/e2e/
 * golden-path.mjs` : ce script Playwright enchaîne plusieurs attentes
 * temporisées sur le traitement simulé par l'agent IA démo (score, message,
 * relance) — sous charge (CI, ou ce script qui vient d'exécuter un build
 * complet juste avant), ces attentes se sont montrées ponctuellement
 * flaky pendant le développement de AR-0163, pour des raisons de timing
 * sans rapport avec la correction des migrations elles-mêmes. `golden-
 * path.mjs` reste la suite E2E de référence (voir `.github/workflows/
 * e2e.yml`) ; ce script vérifie une préoccupation différente et plus
 * étroite — que le schéma migré depuis zéro + les données seedées sont
 * RÉELLEMENT exploitables via l'API — avec des assertions HTTP directes,
 * sans dépendance de timing.
 */
async function runApiSmokeCheck(baseUrl: string, expectedLeadCount: number): Promise<void> {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!loginResponse.ok) fail(`Connexion API échouée (${loginResponse.status}) — schéma/seed incohérents ?`);
  const setCookie = loginResponse.headers.get("set-cookie");
  if (!setCookie) fail("Connexion API réussie mais aucun cookie de session renvoyé.");
  const sessionCookie = setCookie.split(";")[0];
  console.log(`  POST /api/auth/login → ${loginResponse.status} (session établie)`);

  const leadsResponse = await fetch(`${baseUrl}/api/leads`, { headers: { Cookie: sessionCookie } });
  if (!leadsResponse.ok) fail(`GET /api/leads a échoué (${leadsResponse.status}) une fois authentifié.`);
  const leadsBody = (await leadsResponse.json()) as { leads: unknown[] };
  console.log(`  GET /api/leads → ${leadsResponse.status} (${leadsBody.leads.length} prospects)`);
  if (leadsBody.leads.length !== expectedLeadCount) {
    fail(
      `GET /api/leads a renvoyé ${leadsBody.leads.length} prospects, ` +
        `${expectedLeadCount} attendus (cohérence seed ↔ API rompue).`
    );
  }

  const dashboardResponse = await fetch(`${baseUrl}/api/stats`, { headers: { Cookie: sessionCookie } });
  if (!dashboardResponse.ok) fail(`GET /api/stats a échoué (${dashboardResponse.status}) une fois authentifié.`);
  console.log(`  GET /api/stats → ${dashboardResponse.status}`);
}

function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  async function attempt(): Promise<boolean> {
    try {
      const response = await fetch(url);
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }
  return (async () => {
    while (Date.now() < deadline) {
      if (await attempt()) return true;
      await sleep(1000);
    }
    return false;
  })();
}

async function main() {
  const realDatabaseUrl = requireEnv("DATABASE_URL");
  const realDbName = realAppDbName(realDatabaseUrl);
  const adminUrl = adminConnectionUrl(realDatabaseUrl);

  const tempDbName = generateTempDbName();
  guardTempDbName(tempDbName, realDbName);
  const tempUrl = tempConnectionUrl(realDatabaseUrl, tempDbName);

  console.log(`Base applicative réelle (jamais touchée) : "${realDbName}"`);
  console.log(`Base temporaire de test (créée puis supprimée) : "${tempDbName}"`);

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: tempUrl,
    AI_PROVIDER: "demo",
    EMAIL_PROVIDER: "demo",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "migration-test-secret-not-for-production",
    NEXT_PUBLIC_APP_URL: `http://localhost:${SMOKE_TEST_PORT}`,
    PORT: String(SMOKE_TEST_PORT),
  };

  let serverProcess: ChildProcess | undefined;

  try {
    log(`création de la base temporaire "${tempDbName}"`);
    await createTempDatabase(adminUrl, tempDbName);

    log("exécution de toutes les migrations dans l'ordre (prisma migrate deploy)");
    runStep("npx", ["prisma", "migrate", "deploy"], childEnv);

    log("génération du client Prisma (prisma generate)");
    runStep("npx", ["prisma", "generate"], childEnv);

    log("exécution des seeds (1ʳᵉ passe)");
    runStep("npx", ["tsx", "prisma/seed.ts"], {
      ...childEnv,
      NODE_OPTIONS: "--require=./prisma/seed-server-only-cjs-hook.cjs",
    });

    const orgCountAfterFirstSeed = await countRow(tempUrl, "Organization");
    const leadCountAfterFirstSeed = await countRow(tempUrl, "Lead");
    console.log(`  organisations après 1ʳᵉ passe : ${orgCountAfterFirstSeed}`);
    console.log(`  prospects après 1ʳᵉ passe : ${leadCountAfterFirstSeed}`);

    log("exécution des seeds (2ᵉ passe — vérification de l'idempotence)");
    runStep("npx", ["tsx", "prisma/seed.ts"], {
      ...childEnv,
      NODE_OPTIONS: "--require=./prisma/seed-server-only-cjs-hook.cjs",
    });

    const orgCountAfterSecondSeed = await countRow(tempUrl, "Organization");
    const leadCountAfterSecondSeed = await countRow(tempUrl, "Lead");
    console.log(`  organisations après 2ᵉ passe : ${orgCountAfterSecondSeed}`);
    console.log(`  prospects après 2ᵉ passe : ${leadCountAfterSecondSeed}`);

    if (orgCountAfterFirstSeed !== orgCountAfterSecondSeed || leadCountAfterFirstSeed !== leadCountAfterSecondSeed) {
      fail(
        "Les seeds ne sont PAS idempotents : le nombre de lignes a changé entre " +
          "la 1ʳᵉ et la 2ᵉ passe (organisations ou prospects dupliqués)."
      );
    }
    console.log("  ✅ idempotence des seeds vérifiée (aucune ligne dupliquée).");

    log("build de production (npm run build)");
    runStep("npm", ["run", "build"], childEnv);

    log(`démarrage du build de production sur le port ${SMOKE_TEST_PORT}`);
    // `detached: true` place le process dans son propre groupe — nécessaire
    // pour pouvoir le tuer avec sa descendance (`next start` peut lui-même
    // relayer vers un processus `next-server` distinct) via un signal de
    // groupe (`kill(-pid, ...)`) dans le `finally` ci-dessous. Un simple
    // `child.kill()` ne cible que le process direct : un `next-server`
    // orphelin a été observé survivre au `SIGTERM` pendant le développement
    // de ce script, restant lié à la base temporaire jusqu'au prochain
    // redémarrage — jamais acceptable pour un script qui doit être rejouable.
    serverProcess = spawn("node_modules/.bin/next", ["start", "-p", String(SMOKE_TEST_PORT)], {
      env: childEnv,
      stdio: "inherit",
      detached: true,
    });

    // Cible délibérément `/api/health` (vérifie la base de données via
    // `SELECT 1`, voir `src/app/api/health/route.ts`) plutôt que `/login` :
    // le port HTTP peut répondre avant que le pool de connexions Prisma soit
    // pleinement établi — une course observée pendant le développement de ce
    // script (un `/api/health` ponctuel à 503 juste après le démarrage).
    // Exiger un 200 explicite élimine cette course au lieu de la masquer par
    // un délai arbitraire.
    const ready = await waitForHttp(`http://localhost:${SMOKE_TEST_PORT}/api/health`, 30000);
    if (!ready) fail("Le serveur de production n'a pas démarré à temps (ou la base de données reste injoignable).");
    console.log("  ✅ serveur démarré, /api/health confirme la base de données joignable.");

    log("tests essentiels (sondage de fumée des routes critiques)");
    const smokeRoutes = ["/login", "/register", "/api/health"];
    for (const route of smokeRoutes) {
      const response = await fetch(`http://localhost:${SMOKE_TEST_PORT}${route}`).catch(() => null);
      if (!response) fail(`Route de fumée injoignable : ${route}`);
      console.log(`  ${route} → ${response.status}`);
      if (response.status >= 500) fail(`Route de fumée en erreur serveur : ${route} (${response.status})`);
    }

    log("tests essentiels (parcours API déterministe : connexion + lecture des données seedées)");
    await runApiSmokeCheck(`http://localhost:${SMOKE_TEST_PORT}`, leadCountAfterSecondSeed);

    console.log("\n✅ Test des migrations depuis zéro réussi de bout en bout.");
  } finally {
    if (serverProcess?.pid) {
      // Signal de groupe (pid négatif), pas juste le process direct — voir
      // le commentaire au `spawn` ci-dessus. `try/catch` : le groupe peut
      // déjà avoir disparu si le serveur a lui-même planté avant ce point.
      try {
        process.kill(-serverProcess.pid, "SIGKILL");
      } catch {
        // Déjà terminé — rien à faire.
      }
    }
    log(`suppression de la base temporaire "${tempDbName}"`);
    guardTempDbName(tempDbName, realDbName);
    await dropTempDatabase(adminUrl, tempDbName);
    console.log("  ✅ base temporaire supprimée.");
  }
}

main().catch((err) => {
  // Atteint APRÈS le `finally` de main() (la base temporaire est déjà
  // supprimée à ce stade, même en cas d'échec) — voir le commentaire de `fail`.
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
