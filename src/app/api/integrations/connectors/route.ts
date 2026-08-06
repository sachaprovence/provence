import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { getUnifiedConnectorsView } from "@/lib/integrations/connectors-service";

/** Vue consolidée Gmail/Google Calendar/Slack/Discord/Stripe pour l'écran Connecteurs unifié. */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const view = await getUnifiedConnectorsView(actor);
    return NextResponse.json(view);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/integrations/connectors" });
  }
}
