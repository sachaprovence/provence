import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { communicationChannelSchema, communicationConfigUpdateSchema } from "@/lib/validations/communication";
import { updateChannelConfig, getChannelConfigPreview } from "@/lib/communication/hub-service";

type Params = { params: Promise<{ channel: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { channel } = await params;

  const parsedChannel = communicationChannelSchema.safeParse(channel);
  if (!parsedChannel.success) {
    return NextResponse.json({ error: "Canal de communication inconnu." }, { status: 400 });
  }

  try {
    const config = await getChannelConfigPreview(actor.organization.id, parsedChannel.data);
    return NextResponse.json({ config });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/communications/config/[channel]" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { channel } = await params;

  const parsedChannel = communicationChannelSchema.safeParse(channel);
  if (!parsedChannel.success) {
    return NextResponse.json({ error: "Canal de communication inconnu." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = communicationConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const integration = await updateChannelConfig(actor.organization.id, parsedChannel.data, parsed.data);
    return NextResponse.json({ integration });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/communications/config/[channel]" });
  }
}
