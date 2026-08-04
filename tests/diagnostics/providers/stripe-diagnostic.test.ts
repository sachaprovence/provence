import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getStripeConfigState, testStripeConnection } from "@/lib/diagnostics/providers/stripe-diagnostic";

/**
 * Diagnostic Stripe (v1.2, AR-0165) — configuration de déploiement (jamais
 * par organisation), donc testable sans base de données. Le test de
 * connexion (`GET /v1/balance`) est vérifié contre un vrai serveur HTTP
 * local, jamais un compte Stripe réel dans cet environnement de
 * développement (voir docs/release/v1.2-recette.md).
 */
const ORIGINAL_ENV = { ...process.env };

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

afterEach(() => {
  restoreEnv("STRIPE_SECRET_KEY", ORIGINAL_ENV.STRIPE_SECRET_KEY);
  restoreEnv("STRIPE_WEBHOOK_SECRET", ORIGINAL_ENV.STRIPE_WEBHOOK_SECRET);
  restoreEnv("STRIPE_API_BASE_URL", ORIGINAL_ENV.STRIPE_API_BASE_URL);
});

describe("getStripeConfigState (AR-0165)", () => {
  it("NOT_CONFIGURED sans aucune variable", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(await getStripeConfigState()).toBe("NOT_CONFIGURED");
  });

  it("PARTIALLY_CONFIGURED avec une seule des deux variables", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(await getStripeConfigState()).toBe("PARTIALLY_CONFIGURED");
  });

  it("CONFIGURED avec les deux variables", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    expect(await getStripeConfigState()).toBe("CONFIGURED");
  });
});

describe("testStripeConnection — contre un vrai serveur HTTP local", () => {
  let server: http.Server;
  let baseUrl: string;
  let nextStatus = 200;
  let requestLog: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestLog.push({ url: req.url!, headers: req.headers });
      res.writeHead(nextStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify(nextStatus === 401 ? { error: { message: "Invalid API Key provided" } } : { object: "balance" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  afterEach(() => {
    nextStatus = 200;
    requestLog = [];
  });

  it("TEST_SUCCESS si Stripe répond 200, avec l'en-tête Authorization Bearer attendu", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_valid";
    process.env.STRIPE_API_BASE_URL = baseUrl;
    const result = await testStripeConnection();
    expect(result.status).toBe("TEST_SUCCESS");
    expect(requestLog[0].url).toBe("/balance");
    expect(requestLog[0].headers.authorization).toBe("Bearer sk_test_valid");
  });

  it("TEST_FAILED si Stripe répond 401, sans jamais inclure la clé secrète dans le message", async () => {
    nextStatus = 401;
    process.env.STRIPE_SECRET_KEY = "sk_test_invalid_secret_value";
    process.env.STRIPE_API_BASE_URL = baseUrl;
    const result = await testStripeConnection();
    expect(result.status).toBe("TEST_FAILED");
    expect(result.message).not.toContain("sk_test_invalid_secret_value");
  });

  it("UNAVAILABLE si Stripe est injoignable (erreur réseau)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_API_BASE_URL = "http://127.0.0.1:1";
    const result = await testStripeConnection();
    expect(result.status).toBe("UNAVAILABLE");
  });

  it("TEST_FAILED sans appel réseau si STRIPE_SECRET_KEY absente", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await testStripeConnection();
    expect(result.status).toBe("TEST_FAILED");
    expect(requestLog).toHaveLength(0);
  });
});
