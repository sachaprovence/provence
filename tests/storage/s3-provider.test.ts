import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { S3StorageProvider } from "@/lib/storage/providers/s3";
import { ValidationError } from "@/lib/errors";

/**
 * Fournisseur de stockage S3 réel (v1.1, AR-0162) — signature AWS SigV4
 * calculée manuellement (pas de SDK, même convention que Stripe/Sentry/
 * Gmail/Outlook, ADR 0038/0040/0042/0043), vérifiée contre un vrai serveur
 * HTTP local simulant l'API S3.
 */
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.STORAGE_S3_BUCKET = ORIGINAL_ENV.STORAGE_S3_BUCKET;
  process.env.STORAGE_S3_REGION = ORIGINAL_ENV.STORAGE_S3_REGION;
  process.env.STORAGE_S3_ACCESS_KEY_ID = ORIGINAL_ENV.STORAGE_S3_ACCESS_KEY_ID;
  process.env.STORAGE_S3_SECRET_ACCESS_KEY = ORIGINAL_ENV.STORAGE_S3_SECRET_ACCESS_KEY;
  process.env.STORAGE_S3_ENDPOINT = ORIGINAL_ENV.STORAGE_S3_ENDPOINT;
  process.env.STORAGE_S3_PUBLIC_URL_BASE = ORIGINAL_ENV.STORAGE_S3_PUBLIC_URL_BASE;
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

describe("S3StorageProvider — contre un vrai serveur HTTP local simulant S3", () => {
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: Buffer }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        requestLog.push({ url: req.url!, method: req.method!, headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  afterEach(() => {
    requestLog = [];
  });

  it("envoie une requête PUT signée SigV4 avec le bon contenu à l'emplacement attendu", async () => {
    process.env.STORAGE_S3_BUCKET = "test-bucket";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIATEST";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret-test-key";
    process.env.STORAGE_S3_ENDPOINT = baseUrl;
    process.env.STORAGE_S3_PUBLIC_URL_BASE = "https://cdn.example.test";

    const provider = new S3StorageProvider();
    const data = Buffer.from("contenu binaire de test");
    const { url } = await provider.upload({ organizationId: "org-1", fileName: "photo.jpg", mimeType: "image/jpeg", data });

    expect(requestLog).toHaveLength(1);
    const request = requestLog[0];
    expect(request.method).toBe("PUT");
    expect(request.url).toMatch(/^\/org-1\/[a-f0-9-]+-photo\.jpg$/);
    expect(request.body.toString()).toBe("contenu binaire de test");
    expect(request.headers["content-type"]).toBe("image/jpeg");
    expect(request.headers["authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/eu-west-3\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/);
    expect(request.headers["x-amz-content-sha256"]).toHaveLength(64);

    expect(url).toBe(`https://cdn.example.test${request.url}`);
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
});
