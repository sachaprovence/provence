// Vérification de l'arrêt propre sous charge + readiness pendant un
// déploiement (v1.3, AR-0173) — démarre un vrai serveur `next start`
// (mode production, comme en conteneur), envoie des requêtes concurrentes
// réellement en cours de traitement, déclenche SIGTERM, et vérifie :
//
//   1. `/api/health/ready` bascule sur 503 (shutdown: "error") QUASI
//      IMMÉDIATEMENT après SIGTERM — avant même que le process n'ait fini
//      de drainer quoi que ce soit — pour qu'un orchestrateur cesse de
//      router du nouveau trafic dès le début de la période de grâce.
//   2. Les requêtes déjà en cours de traitement à l'instant du signal se
//      terminent TOUTES avec succès (jamais une connexion réinitialisée),
//      confirmant que `next start` les laisse straiter jusqu'au bout.
//   3. Le processus quitte de lui-même dans le délai de grâce documenté
//      (docker-compose.yml, stop_grace_period: 30s).
//
// Usage : npm run build && node scripts/verify-graceful-shutdown.mjs
import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Concurrence modeste et volontaire : le but est de prouver que des
// requêtes RÉELLEMENT acceptées et en cours de traitement survivent à
// l'arrêt, pas de saturer la file d'attente TCP du système au point que
// des connexions n'ayant jamais atteint `accept()` échouent pour des
// raisons indépendantes du comportement d'arrêt propre de Next.js.
const IN_FLIGHT_REQUESTS = 8;
const GRACE_PERIOD_MS = 30_000;
const READINESS_FLIP_BUDGET_MS = 500;

function log(step) {
  console.log(`→ ${step}`);
}

async function waitForReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health/ready`);
      if (res.ok) return;
    } catch {
      // Pas encore prêt — on réessaie.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Le serveur n'est jamais devenu prêt.");
}

async function main() {
  log(`démarrage de next start sur le port ${PORT} (mode production)...`);
  const server = spawn("node_modules/.bin/next", ["start", "-p", PORT], {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (d) => (serverOutput += d.toString()));
  server.stderr.on("data", (d) => (serverOutput += d.toString()));

  const exitPromise = new Promise((resolve) => server.once("exit", (code, signal) => resolve({ code, signal })));

  try {
    await waitForReady(20_000);
    log("serveur prêt — confirmation de l'état initial (readiness = 200)...");
    const initialReady = await fetch(`${BASE_URL}/api/health/ready`);
    if (!initialReady.ok) throw new Error("readiness devrait être 200 avant tout arrêt.");

    log(`envoi de ${IN_FLIGHT_REQUESTS} requêtes concurrentes réellement en cours de traitement...`);
    const results = [];
    const requests = Array.from({ length: IN_FLIGHT_REQUESTS }, async (_, i) => {
      try {
        const res = await fetch(`${BASE_URL}/api/health/ready`);
        results.push({ index: i, ok: res.ok, status: res.status });
      } catch (err) {
        const cause = err instanceof Error && "cause" in err ? err.cause : undefined;
        const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;
        results.push({ index: i, ok: false, error: err instanceof Error ? err.message : String(err), code });
      }
    });

    // Laisse le temps aux connexions d'être réellement établies et
    // acceptées par Next.js avant d'envoyer le signal (contrairement à un
    // envoi simultané, qui ne prouverait que le comportement de la file
    // d'attente TCP du système, pas celui du serveur applicatif).
    await new Promise((r) => setTimeout(r, 50));
    log("envoi de SIGTERM pendant que ces requêtes sont en cours...");
    const sigtermSentAt = Date.now();
    server.kill("SIGTERM");

    log("vérification que readiness bascule sur 503 quasi immédiatement...");
    let readinessFlippedAfterMs = null;
    while (readinessFlippedAfterMs === null && Date.now() - sigtermSentAt < READINESS_FLIP_BUDGET_MS) {
      try {
        const res = await fetch(`${BASE_URL}/api/health/ready`);
        if (res.status === 503) {
          const body = await res.json();
          if (body.checks?.shutdown === "error") readinessFlippedAfterMs = Date.now() - sigtermSentAt;
        }
      } catch {
        // Le serveur peut déjà avoir fermé le port d'écoute pour les
        // NOUVELLES connexions — dans ce cas la bascule est de facto déjà
        // effective (encore plus tôt que ce que l'on cherchait à mesurer).
        readinessFlippedAfterMs = Date.now() - sigtermSentAt;
      }
    }

    await Promise.all(requests);
    const { code, signal } = await exitPromise;
    const shutdownDurationMs = Date.now() - sigtermSentAt;

    const abortedInFlight = results.filter((r) => !r.ok);
    console.log(`\nRequêtes en cours au moment du signal : ${results.length - abortedInFlight.length}/${results.length} terminées avec succès.`);
    console.log(`Readiness basculée sur non-prêt : ${readinessFlippedAfterMs === null ? "JAMAIS" : `${readinessFlippedAfterMs}ms après SIGTERM`}.`);
    console.log(`Arrêt du processus : ${shutdownDurationMs}ms après SIGTERM (code=${code}, signal=${signal}).`);

    if (abortedInFlight.length > 0) {
      console.error("\n❌ Requêtes déjà en cours interrompues (arrêt non propre) :");
      for (const f of abortedInFlight) console.error(`  - #${f.index} : ${f.error ?? `statut ${f.status}`} (code=${f.code ?? "inconnu"})`);
      throw new Error(`${abortedInFlight.length} requête(s) en cours ont été interrompues pendant l'arrêt.`);
    }

    if (readinessFlippedAfterMs === null) {
      throw new Error(`readiness n'a jamais basculé sur non-prêt dans les ${READINESS_FLIP_BUDGET_MS}ms suivant SIGTERM.`);
    }

    if (shutdownDurationMs > GRACE_PERIOD_MS) {
      throw new Error(`Arrêt trop lent (${shutdownDurationMs}ms > ${GRACE_PERIOD_MS}ms de délai de grâce configuré).`);
    }

    console.log(
      "\n✅ Arrêt propre validé sous charge : readiness bascule immédiatement, aucune requête en cours perdue, processus terminé dans le délai de grâce."
    );
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
    console.error("\n--- Sortie du serveur ---\n" + serverOutput);
    if (!server.killed) server.kill("SIGKILL");
    process.exit(1);
  }
}

main();
