import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  requireS3BackupConfig,
  listAllObjects,
  getObject,
  putObjectAtKey,
  deleteObjectAtKey,
  sha256HexOf,
  type S3BackupConfig,
} from "../../scripts/lib/s3-backup-client";

/**
 * Client S3 bas-niveau réservé aux scripts de sauvegarde (v1.2, AR-0166) —
 * vérifié contre un vrai serveur HTTP local qui simule un magasin
 * d'objets S3 MUTABLE (Map en mémoire), pour que les tests de
 * lecture/écriture/suppression/pagination soient de véritables allers-
 * retours plutôt que des réponses figées — jamais un vrai compte AWS dans
 * cet environnement de développement.
 */
const ORIGINAL_ENV = { ...process.env };

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
});

describe("requireS3BackupConfig (AR-0166)", () => {
  it("échoue explicitement sans configuration", () => {
    delete process.env.STORAGE_S3_BUCKET;
    delete process.env.STORAGE_S3_REGION;
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    expect(() => requireS3BackupConfig()).toThrow(/non configuré/);
  });
});

describe("client S3 de sauvegarde — contre un vrai serveur HTTP local mutable", () => {
  let server: http.Server;
  let baseUrl: string;
  let config: S3BackupConfig;
  const store = new Map<string, { data: Buffer; contentType: string }>();
  let requestLog: { method: string; url: string }[] = [];

  function xmlEscape(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const url = new URL(req.url!, "http://localhost");
        requestLog.push({ method: req.method!, url: req.url! });

        if (req.method === "GET" && url.pathname === "/" && url.searchParams.get("list-type") === "2") {
          const prefix = url.searchParams.get("prefix") ?? "";
          const continuationToken = url.searchParams.get("continuation-token");
          const allKeys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
          const startIndex = continuationToken ? Number(continuationToken) : 0;
          const pageSize = 2; // Pagination volontairement petite pour exercer `continuation-token` avec peu d'objets de test.
          const page = allKeys.slice(startIndex, startIndex + pageSize);
          const isTruncated = startIndex + pageSize < allKeys.length;
          const contentsXml = page
            .map((key) => `<Contents><Key>${xmlEscape(key)}</Key><Size>${store.get(key)!.data.byteLength}</Size><ETag>"etag"</ETag></Contents>`)
            .join("");
          const xml = `<?xml version="1.0"?><ListBucketResult>${contentsXml}<IsTruncated>${isTruncated}</IsTruncated>${
            isTruncated ? `<NextContinuationToken>${startIndex + pageSize}</NextContinuationToken>` : ""
          }</ListBucketResult>`;
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(xml);
          return;
        }

        const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
        if (req.method === "GET") {
          const object = store.get(key);
          if (!object) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": object.contentType });
          res.end(object.data);
          return;
        }
        if (req.method === "PUT") {
          store.set(key, { data: body, contentType: req.headers["content-type"] ?? "application/octet-stream" });
          res.writeHead(200);
          res.end();
          return;
        }
        if (req.method === "DELETE") {
          store.delete(key);
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(405);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  afterEach(() => {
    store.clear();
    requestLog = [];
  });

  beforeAll(() => {
    config = { bucket: "test-bucket", region: "eu-west-3", accessKeyId: "AKIATEST", secretAccessKey: "secret", endpoint: "" };
  });

  it("putObjectAtKey puis getObject effectuent un aller-retour réel identique", async () => {
    config.endpoint = baseUrl;
    const data = Buffer.from("contenu réel de sauvegarde");
    await putObjectAtKey(config, "org-1/fichier.pdf", data, "application/pdf");

    const result = await getObject(config, "org-1/fichier.pdf");
    expect(result.data.toString()).toBe("contenu réel de sauvegarde");
    expect(result.contentType).toBe("application/pdf");
    expect(sha256HexOf(result.data)).toBe(sha256HexOf(data));
  });

  it("écrit à la clé EXACTE fournie, sans génération d'UUID ni prise en compte de l'organisation appelante", async () => {
    config.endpoint = baseUrl;
    await putObjectAtKey(config, "chemin/exact/voulu.txt", Buffer.from("x"), "text/plain");
    const result = await getObject(config, "chemin/exact/voulu.txt");
    expect(result.data.toString()).toBe("x");
  });

  it("deleteObjectAtKey supprime réellement l'objet (vérifié par un GET 404 après coup)", async () => {
    config.endpoint = baseUrl;
    await putObjectAtKey(config, "a-supprimer.txt", Buffer.from("x"), "text/plain");
    await deleteObjectAtKey(config, "a-supprimer.txt");
    await expect(getObject(config, "a-supprimer.txt")).rejects.toThrow(/404/);
  });

  it("deleteObjectAtKey est idempotent (aucune erreur si l'objet n'existe déjà plus)", async () => {
    config.endpoint = baseUrl;
    await expect(deleteObjectAtKey(config, "jamais-existe.txt")).resolves.toBeUndefined();
  });

  it("listAllObjects suit la pagination (continuation-token) jusqu'à épuisement, jamais tronqué", async () => {
    config.endpoint = baseUrl;
    for (let i = 0; i < 5; i += 1) {
      await putObjectAtKey(config, `org-1/fichier-${i}.txt`, Buffer.from(`contenu ${i}`), "text/plain");
    }

    const objects = await listAllObjects(config);
    expect(objects.map((o) => o.key).sort()).toEqual(["org-1/fichier-0.txt", "org-1/fichier-1.txt", "org-1/fichier-2.txt", "org-1/fichier-3.txt", "org-1/fichier-4.txt"]);

    const listRequests = requestLog.filter((r) => r.method === "GET" && r.url.startsWith("/?"));
    expect(listRequests.length).toBeGreaterThan(1); // Preuve que plusieurs pages ont réellement été parcourues (5 objets, pageSize=2 côté serveur de test).
  });

  it("listAllObjects respecte le préfixe fourni", async () => {
    config.endpoint = baseUrl;
    await putObjectAtKey(config, "org-a/fichier.txt", Buffer.from("a"), "text/plain");
    await putObjectAtKey(config, "org-b/fichier.txt", Buffer.from("b"), "text/plain");

    const objects = await listAllObjects(config, "org-a/");
    expect(objects.map((o) => o.key)).toEqual(["org-a/fichier.txt"]);
  });

  it("listAllObjects renvoie une liste vide sur un bucket sans objet, sans erreur", async () => {
    config.endpoint = baseUrl;
    const objects = await listAllObjects(config);
    expect(objects).toEqual([]);
  });

  it("getObject lève une erreur explicite (jamais un succès simulé) si l'objet est absent", async () => {
    config.endpoint = baseUrl;
    await expect(getObject(config, "absent.txt")).rejects.toThrow(/404/);
  });
});
