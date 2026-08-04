import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { captureException } from "@/lib/observability/error-tracking";

/**
 * Capture d'erreurs (v0.9 bis, AR-0048) — vérifie : (1) l'échec explicite
 * quand `SENTRY_DSN` est absent (jamais un succès simulé), (2) un envoi RÉEL
 * réussi contre un vrai petit serveur HTTP local simulant l'API d'ingestion
 * Sentry (comme les fournisseurs email/Google Calendar), (3) le cas d'échec
 * HTTP (Sentry indisponible) traité comme un échec explicite, jamais une
 * exception qui remonterait à l'appelant.
 */
describe("captureException — échec explicite sans SENTRY_DSN", () => {
  it("renvoie captured: false avec une raison, jamais une exception", async () => {
    const result = await captureException(new Error("test sans dsn"), {}, { dsn: undefined });
    expect(result.captured).toBe(false);
    if (!result.captured) expect(result.reason).toMatch(/non configuré/);
  });

  it("renvoie captured: false pour un DSN invalide (jamais un throw)", async () => {
    const result = await captureException(new Error("test dsn invalide"), {}, { dsn: "not-a-valid-dsn" });
    expect(result.captured).toBe(false);
  });
});

describe("captureException — envoi réel contre un vrai serveur Sentry local", () => {
  let server: http.Server;
  let port: number;
  const receivedRequests: { url: string; contentType: string | undefined; body: string }[] = [];

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("envoie réellement un envelope Sentry valide en POST", async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedRequests.push({ url: req.url ?? "", contentType: req.headers["content-type"], body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "test-event-id" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;

    const dsn = "https://testpublickey@localhost/123456";
    const result = await captureException(
      new Error("erreur de test réelle"),
      { route: "/api/test", organizationId: "org-test-123" },
      { dsn, baseUrl: `http://127.0.0.1:${port}` }
    );

    expect(result.captured).toBe(true);
    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0].url).toMatch(/^\/api\/123456\/envelope\/\?sentry_key=testpublickey/);
    expect(receivedRequests[0].contentType).toBe("application/x-sentry-envelope");

    const lines = receivedRequests[0].body.split("\n");
    expect(lines).toHaveLength(3);
    const envelopeHeader = JSON.parse(lines[0]);
    expect(envelopeHeader.dsn).toBe(dsn);
    const itemHeader = JSON.parse(lines[1]);
    expect(itemHeader.type).toBe("event");
    const event = JSON.parse(lines[2]);
    expect(event.message).toBe("erreur de test réelle");
    expect(event.tags.route).toBe("/api/test");
    expect(event.extra.organizationId).toBe("org-test-123");
  });

  it("une réponse HTTP d'erreur du serveur Sentry est traitée comme un échec explicite", async () => {
    const failingServer = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end("Internal Server Error");
    });
    await new Promise<void>((resolve) => failingServer.listen(0, "127.0.0.1", resolve));
    const failingPort = (failingServer.address() as AddressInfo).port;

    try {
      const result = await captureException(
        new Error("test échec serveur"),
        {},
        { dsn: "https://key@localhost/1", baseUrl: `http://127.0.0.1:${failingPort}` }
      );
      expect(result.captured).toBe(false);
      if (!result.captured) expect(result.reason).toMatch(/500/);
    } finally {
      await new Promise<void>((resolve) => failingServer.close(() => resolve()));
    }
  });
});
