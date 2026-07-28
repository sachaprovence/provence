import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { confirmPasswordResetSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = confirmPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const reset = await prisma.passwordResetToken.findUnique({ where: { token: parsed.data.token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return NextResponse.json({ error: "Lien de réinitialisation invalide ou expiré." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
