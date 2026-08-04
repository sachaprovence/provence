import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DemoStorageProvider } from "@/lib/storage/demo-provider";
import { getStorageProvider } from "@/lib/storage";
import { ValidationError } from "@/lib/errors";

/**
 * Stockage démo (v1.1, AR-0162 ; téléchargement/suppression/validation
 * réels v1.2, AR-0164) — écrit réellement sur le système de fichiers
 * local, sans configuration externe.
 */
describe("DemoStorageProvider", () => {
  const orgId = `org-storage-test-${Date.now()}`;
  const otherOrgId = `org-storage-other-${Date.now()}`;

  afterAll(async () => {
    await fs.rm(path.join(process.cwd(), "storage-demo", orgId), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), "storage-demo", otherOrgId), { recursive: true, force: true });
  });

  it("écrit le fichier sur disque et renvoie une URL + une clé servies par /api/storage/demo", async () => {
    const provider = new DemoStorageProvider();
    const data = Buffer.from("contenu de test");

    const { url, key } = await provider.upload({ organizationId: orgId, fileName: "photo.jpg", mimeType: "image/jpeg", data });

    expect(url).toMatch(new RegExp(`^/api/storage/demo/${orgId}/[a-f0-9-]+-photo\\.jpg$`));
    expect(key).toBe(url.replace("/api/storage/demo/", ""));

    const written = await fs.readFile(path.join(process.cwd(), "storage-demo", key));
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

  it("rejette un fichier trop volumineux avant toute écriture disque", async () => {
    const provider = new DemoStorageProvider();
    const oversized = Buffer.alloc(21 * 1024 * 1024);
    await expect(
      provider.upload({ organizationId: orgId, fileName: "trop-gros.pdf", mimeType: "application/pdf", data: oversized })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejette un type MIME non autorisé", async () => {
    const provider = new DemoStorageProvider();
    await expect(
      provider.upload({ organizationId: orgId, fileName: "script.exe", mimeType: "application/x-msdownload", data: Buffer.from("x") })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("télécharge un fichier précédemment uploadé (round-trip upload → download)", async () => {
    const provider = new DemoStorageProvider();
    const original = Buffer.from("contenu à retélécharger");
    const { key } = await provider.upload({ organizationId: orgId, fileName: "rapport.pdf", mimeType: "application/pdf", data: original });

    const { data, mimeType } = await provider.download({ organizationId: orgId, key });
    expect(data.toString()).toBe("contenu à retélécharger");
    expect(mimeType).toBe("application/pdf");
  });

  it("refuse de télécharger une clé n'appartenant pas à l'organisation appelante", async () => {
    const provider = new DemoStorageProvider();
    const { key } = await provider.upload({ organizationId: orgId, fileName: "prive.pdf", mimeType: "application/pdf", data: Buffer.from("x") });

    await expect(provider.download({ organizationId: otherOrgId, key })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse de supprimer une clé n'appartenant pas à l'organisation appelante", async () => {
    const provider = new DemoStorageProvider();
    const { key } = await provider.upload({ organizationId: orgId, fileName: "prive2.pdf", mimeType: "application/pdf", data: Buffer.from("x") });

    await expect(provider.delete({ organizationId: otherOrgId, key })).rejects.toBeInstanceOf(ValidationError);
    // Toujours présent : la tentative refusée n'a rien supprimé.
    await expect(provider.download({ organizationId: orgId, key })).resolves.toBeDefined();
  });

  it("supprime réellement le fichier du disque, puis reste idempotent sur une suppression répétée", async () => {
    const provider = new DemoStorageProvider();
    const { key } = await provider.upload({ organizationId: orgId, fileName: "a-supprimer.pdf", mimeType: "application/pdf", data: Buffer.from("x") });

    await provider.delete({ organizationId: orgId, key });
    await expect(provider.download({ organizationId: orgId, key })).rejects.toThrow();

    // Deuxième suppression de la même clé, déjà absente : ne doit pas lever.
    await expect(provider.delete({ organizationId: orgId, key })).resolves.toBeUndefined();
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
