import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { sendCommunicationSchema } from "@/lib/validations/communication";
import { sendCommunication } from "@/lib/communication/hub-service";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = sendCommunicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await sendCommunication(actor.organization.id, parsed.data.channel, {
      to: parsed.data.to,
      subject: parsed.data.subject,
      body: parsed.data.body,
      metadata: parsed.data.metadata,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/communications/send" });
  }
}
