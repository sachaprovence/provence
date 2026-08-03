import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getCurrentActor } from "@/lib/auth";

const payloadSchema = z.object({
  message: z.string().max(2000),
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
});

/**
 * Reçoit les erreurs capturées par les error boundaries React côté navigateur
 * (`error.tsx`, `global-error.tsx`) pour les journaliser côté serveur au même
 * endroit que les erreurs serveur. Ne renvoie jamais d'erreur bloquante au
 * client : un échec de journalisation ne doit jamais aggraver l'incident
 * d'origine.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 204 });
  }

  const actor = await getCurrentActor().catch(() => null);
  logger.error(
    {
      source: "client",
      digest: parsed.data.digest,
      path: parsed.data.path,
      organizationId: actor?.organization.id,
      userId: actor?.user.id,
    },
    parsed.data.message
  );

  return new NextResponse(null, { status: 204 });
}
