import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DemoStorageProvider } from "@/lib/storage/demo-provider";
import { getStorageProvider } from "@/lib/storage";

/**
 * Stockage démo (v1.1, AR-0162) — écrit réellement sur le système de
 * fichiers local, sans configuration externe.
 */
describe("DemoStorageProvider", () => {
  const orgId = `org-storage-test-${Date.now()}`;

  afterAll(async () => {
    await fs.rm(path.join(process.cwd(), "storage-demo", orgId), { recursive: true, force: true });
  });

  it("écrit le fichier sur disque et renvoie une URL servie par /api/storage/demo", async () => {
    const provider = new DemoStorageProvider();
    const data = Buffer.from("contenu de test");

    const { url } = await provider.upload({ organizationId: orgId, fileName: "photo.jpg", mimeType: "image/jpeg", data });

    expect(url).toMatch(new RegExp(`^/api/storage/demo/${orgId}/[a-f0-9-]+-photo\\.jpg$`));

    const relativePath = url.replace("/api/storage/demo/", "");
    const written = await fs.readFile(path.join(process.cwd(), "storage-demo", relativePath));
    expect(written.toString()).toBe("contenu de test");
  });

  it("assainit les noms de fichiers dangereux (aucune traversée de chemin possible)", async () => {
    const provider = new DemoStorageProvider();
    const { url } = await provider.upload({
      organizationId: orgId,
      fileName: "../../etc/passwd",
      mimeType: "text/plain",
      data: Buffer.from("x"),
    });

    // Les "/" sont neutralisés (remplacés) — le résultat reste un unique
    // segment de fichier sous le dossier de l'organisation, quels que
    // soient les points conservés (un nom de fichier légitime peut en
    // contenir) : aucune traversée de répertoire n'est possible.
    const segments = url.replace(`/api/storage/demo/${orgId}/`, "").split("/");
    expect(segments).toHaveLength(1);
  });
});

describe("getStorageProvider", () => {
  it("renvoie le fournisseur démo par défaut", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorageProvider().name).toBe("demo");
  });

  it("renvoie le fournisseur S3 quand STORAGE_PROVIDER=s3", () => {
    process.env.STORAGE_PROVIDER = "s3";
    expect(getStorageProvider().name).toBe("s3");
    delete process.env.STORAGE_PROVIDER;
  });
});
