import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { DemoStorageProvider } from "@/lib/storage/demo-provider";

/**
 * Sert les fichiers du fournisseur de stockage démo (v1.1, AR-0162 ;
 * délègue à `DemoStorageProvider.download` depuis v1.2, AR-0164 pour ne
 * jamais dupliquer la logique d'isolation par organisation / rejet de
 * traversée — voir `key-guard.ts`) — authentifié, vérifie que le premier
 * segment de la clé (`organizationId`) correspond bien à l'organisation de
 * l'acteur avant de servir le fichier.
 */
const provider = new DemoStorageProvider();

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { path: segments } = await params;
  const key = segments.join("/");

  try {
    const { data, mimeType } = await provider.download({ organizationId: actor.organization.id, key });
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": mimeType } });
  } catch {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}
