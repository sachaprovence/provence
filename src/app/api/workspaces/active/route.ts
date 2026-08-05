import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { setActiveWorkspace } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { setActiveWorkspaceSchema } from "@/lib/validations/workspace";

/**
 * Change le workspace actif de la session en cours. Le `workspaceId` fourni
 * par le client n'est qu'une *demande* : `setActiveWorkspace` revérifie
 * côté serveur que l'acteur possède réellement une `WorkspaceMembership`
 * pour ce workspace avant d'écrire quoi que ce soit (voir ADR 0005).
 */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = setActiveWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const workspace = await setActiveWorkspace(actor, parsed.data.workspaceId);
    return NextResponse.json({ workspace });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workspaces/active" });
  }
}
