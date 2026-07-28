import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { requestPasswordResetSchema } from "@/lib/validations/auth";

/**
 * Mode démo : aucun service d'envoi d'email transactionnel n'est branché par
 * défaut. Le lien de réinitialisation est renvoyé directement dans la réponse
 * (affiché à l'écran) au lieu d'être envoyé par email. En production,
 * brancher un envoi réel ici via le fournisseur EmailProvider.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    // On ne révèle pas si l'email existe ou non.
    return NextResponse.json({ ok: true });
  }

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  return NextResponse.json({ ok: true, demoResetLink: `/reset-password/${token}` });
}
