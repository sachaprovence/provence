import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";

const STORAGE_ROOT = path.join(process.cwd(), "storage-demo");

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Sert les fichiers du fournisseur de stockage démo (v1.1, AR-0162) —
 * authentifié, vérifie que le premier segment (`organizationId`)
 * correspond bien à l'organisation de l'acteur avant de servir le
 * fichier, pour empêcher qu'une organisation accède aux fichiers d'une
 * autre en devinant une URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { path: segments } = await params;
  if (segments.length < 2 || segments[0] !== actor.organization.id) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
  if (segments.some((segment) => segment.includes("..") || segment.includes("/"))) {
    return NextResponse.json({ error: "Chemin invalide." }, { status: 400 });
  }

  const filePath = path.join(STORAGE_ROOT, ...segments);
  try {
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = EXTENSION_MIME_TYPES[extension] || "application/octet-stream";
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
