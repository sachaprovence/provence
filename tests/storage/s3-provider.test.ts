import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { S3StorageProvider } from "@/lib/storage/providers/s3";
import { ValidationError, NotFoundError } from "@/lib/errors";

/**
 * Fournisseur de stockage S3 réel (v1.1, AR-0162 ; téléchargement/
 * suppression/délai/validation réels v1.2, AR-0164) — signature AWS SigV4
 * calculée manuellement (pas de SDK, même convention que Stripe/Sentry/
 * Gmail/Outlook, ADR 0038/0040/0042/0043), vérifiée contre un vrai serveur
 * HTTP local simulant l'API S3 — jamais un vrai compte AWS dans cet
 * environnement de développement (voir docs/release/v1.2-recette.md pour
 * la réserve correspondante).
 */
const ORIGINAL_ENV = { ...process.env };

/**
 * `process.env.KEY = undefined` NE supprime PAS la variable : Node
 * convertit toute valeur assignée en chaîne, donc cela affecterait
 * littéralement la chaîne `"undefined"` plutôt que de la faire disparaître
 * (voir tests/storage/validation.test.ts pour le bug réel que ce piège a
 * causé pendant le développement de v1.2).
 */
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

afterEach(() => {
  restoreEnv("STORAGE_S3_BUCKET", ORIGINAL_ENV.STORAGE_S3_BUCKET);
  restoreEnv("STORAGE_S3_REGION", ORIGINAL_ENV.STORAGE_S3_REGION);
  restoreEnv("STORAGE_S3_ACCESS_KEY_ID", ORIGINAL_ENV.STORAGE_S3_ACCESS_KEY_ID);
  restoreEnv("STORAGE_S3_SECRET_ACCESS_KEY", ORIGINAL_ENV.STORAGE_S3_SECRET_ACCESS_KEY);
  restoreEnv("STORAGE_S3_ENDPOINT", ORIGINAL_ENV.STORAGE_S3_ENDPOINT);
  restoreEnv("STORAGE_S3_PUBLIC_URL_BASE", ORIGINAL_ENV.STORAGE_S3_PUBLIC_URL_BASE);
  restoreEnv("STORAGE_S3_TIMEOUT_MS", ORIGINAL_ENV.STORAGE_S3_TIMEOUT_MS);
});

describe("S3StorageProvider — échec explicite sans configuration", () => {
  it("upload échoue explicitement sans configuration S3", async () => {
    delete process.env.STORAGE_S3_BUCKET;
    delete process.env.STORAGE_S3_REGION;
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    const provider = new S3StorageProvider();
    await expect(
      provider.upload({ organizationId: "org-1", fileName: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("x") })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("S3StorageProvider — validation avant tout appel réseau", () => {
  it("rejette un fichier trop volumineux sans jamais contacter S3", async () => {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1"; // port jamais accepté — prouve qu'aucun appel n'est tenté

    const provider = new S3StorageProvider();
    const oversized = Buffer.alloc(21 * 1024 * 1024);
    await expect(
      provider.upload({ organizationId: "org-1", fileName: "trop-gros.pdf", mimeType: "application/pdf", data: oversized })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejette un type MIME non autorisé sans jamais contacter S3", async () => {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1";

    const provider = new S3StorageProvider();
    await expect(
      provider.upload({ organizationId: "org-1", fileName: "virus.exe", mimeType: "application/x-msdownload", data: Buffer.from("x") })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("S3StorageProvider — isolation par organisation avant tout appel réseau", () => {
  it("refuse un download dont la clé n'appartient pas à l'organisation appelante", async () => {
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1";
    const provider = new S3StorageProvider();
    await expect(provider.download({ organizationId: "org-a", key: "org-b/fichier.pdf" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse un delete dont la clé n'appartient pas à l'organisation appelante", async () => {
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1";
    const provider = new S3StorageProvider();
    await expect(provider.delete({ organizationId: "org-a", key: "org-b/fichier.pdf" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("S3StorageProvider — contre un vrai serveur HTTP local simulant S3", () => {
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: Buffer }[] = [];
  let nextResponse: { status: number; body?: Buffer; headers?: Record<string, string> } = { status: 200 };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        requestLog.push({ url: req.url!, method: req.method!, headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(nextResponse.status, nextResponse.headers);
        res.end(nextResponse.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  afterEach(() => {
    requestLog = [];
    nextResponse = { status: 200 };
  });

  function configure() {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = baseUrl;
    process.env.STORAGE_S3_PUBLIC_URL_BASE = "https://cdn.example.test";
  }

  it("envoie une requête PUT signée SigV4 avec le bon contenu à l'emplacement attendu", async () => {
    configure();
    const provider = new S3StorageProvider();
    const data = Buffer.from("contenu binaire de test");
    const { url, key } = await provider.upload({ organizationId: "org-1", fileName: "photo.jpg", mimeType: "image/jpeg", data });

    expect(requestLog).toHaveLength(1);
    const request = requestLog[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toMatch(/^\/org-1\/[a-f0-9-]+-photo\.jpg$/);
    expect(request.body.toString()).toBe("contenu binaire de test");
    expect(request.headers["content-type"]).toBe("image/jpeg");
    expect(request.headers["authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/eu-west-3\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
    expect(request.headers["x-amz-content-sha256"]).toHaveLength(64);

    expect(url).toBe(`https://cdn.example.test${request.url}`);
    expect(key).toBe(request.url.replace(/^\//, ""));
  });

  it("lève une erreur explicite si le serveur S3 renvoie une erreur", async () => {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1";

    const provider = new S3StorageProvider();
    await expect(
      provider.upload({ organizationId: "org-1", fileName: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("x") })
    ).rejects.toThrow();
  });

  it("envoie une requête GET signée SigV4 sans corps et renvoie les données + le type MIME de la réponse", async () => {
    configure();
    nextResponse = { status: 200, body: Buffer.from("contenu téléchargé"), headers: { "Content-Type": "application/pdf" } };

    const provider = new S3StorageProvider();
    const { data, mimeType } = await provider.download({ organizationId: "org-1", key: "org-1/rapport.pdf" });

    expect(requestLog).toHaveLength(1);
    const request = requestLog[0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/org-1/rapport.pdf");
    expect(request.body).toHaveLength(0);
    // Hash SHA-256 de la chaîne vide — requête GET, donc sans corps à signer.
    expect(request.headers["x-amz-content-sha256"]).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

    expect(data.toString()).toBe("contenu téléchargé");
    expect(mimeType).toBe("application/pdf");
  });

  it("lève NotFoundError si S3 renvoie 404 au téléchargement", async () => {
    configure();
    nextResponse = { status: 404 };

    const provider = new S3StorageProvider();
    await expect(provider.download({ organizationId: "org-1", key: "org-1/absent.pdf" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("envoie une requête DELETE signée SigV4 sans corps", async () => {
    configure();
    nextResponse = { status: 204 };

    const provider = new S3StorageProvider();
    await provider.delete({ organizationId: "org-1", key: "org-1/a-supprimer.pdf" });

    expect(requestLog).toHaveLength(1);
    const request = requestLog[0];
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("/org-1/a-supprimer.pdf");
    expect(request.body).toHaveLength(0);
  });

  it("testConnection() renvoie TEST_SUCCESS quand S3 répond 404 (bucket accessible, authentification valide, clé sondée absente) — AR-0165", async () => {
    configure();
    nextResponse = { status: 404 };

    const provider = new S3StorageProvider();
    const result = await provider.testConnection();
    expect(result.status).toBe("TEST_SUCCESS");
    expect(requestLog[0].method).toBe("GET");
    expect(requestLog[0].url).toMatch(/^\/__provence_diagnostic_check__\//);
  });

  it("testConnection() renvoie TEST_FAILED quand S3 répond 403 (AR-0165)", async () => {
    configure();
    nextResponse = { status: 403 };

    const provider = new S3StorageProvider();
    const result = await provider.testConnection();
    expect(result.status).toBe("TEST_FAILED");
  });

  it("testConnection() renvoie UNAVAILABLE si le endpoint S3 est injoignable (AR-0165)", async () => {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1";

    const provider = new S3StorageProvider();
    const result = await provider.testConnection();
    expect(result.status).toBe("UNAVAILABLE");
  });

  it("respecte un délai maximal configurable et distingue l'erreur de timeout d'une erreur réseau", async () => {
    configure();
    process.env.STORAGE_S3_TIMEOUT_MS = "100";

    // Serveur qui ne répond jamais dans le délai imparti.
    const hangingServer = http.createServer(() => {
      /* ne répond jamais */
    });
    await new Promise<void>((resolve) => hangingServer.listen(0, "127.0.0.1", resolve));
    process.env.STORAGE_S3_ENDPOINT = `http://127.0.0.1:${(hangingServer.address() as AddressInfo).port}`;

    try {
      const provider = new S3StorageProvider();
      await expect(
        provider.upload({ organizationId: "org-1", fileName: "photo.jpg", mimeType: "image/jpeg", data: Buffer.from("x") })
      ).rejects.toThrow(/Délai dépassé/);
    } finally {
      await new Promise<void>((resolve) => hangingServer.close(() => resolve()));
    }
  });
});
