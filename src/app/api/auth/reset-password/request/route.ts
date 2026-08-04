import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { requestPasswordResetSchema } from "@/lib/validations/auth";
import { getEmailProvider } from "@/lib/email";
import { logger } from "@/lib/logger";

const DEFAULT_FROM_EMAIL = "contact@demo.provence360.local";

/**
 * Envoie réellement l'email de réinitialisation dès qu'un fournisseur réel
 * est configuré (v0.10, AR-0153) — corrige une faille critique : cette
 * route renvoyait auparavant `demoResetLink` en clair dans la réponse JSON
 * dans TOUS les environnements, permettant une prise de contrôle de compte
 * triviale (n'importe qui connaissant l'email d'un compte pouvait récupérer
 * un lien de réinitialisation valide directement dans la réponse HTTP,
 * sans jamais recevoir le moindre email). `demoResetLink` n'est désormais
 * renvoyé QUE si aucun fournisseur réel n'est configuré (`AI_PROVIDER`
 * n'est pas concerné ici — voir `EMAIL_PROVIDER`).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { take: 1, orderBy: { createdAt: "asc" }, include: { organization: true } } },
  });
  if (!user) {
    // On ne révèle jamais si l'email existe ou non — comportement identique avec ou sans fournisseur réel.
    return NextResponse.json({ ok: true });
  }

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const resetPath = `/reset-password/${token}`;
  const provider = getEmailProvider();

  if (provider.name === "demo") {
    return NextResponse.json({ ok: true, demoResetLink: resetPath });
  }

  const organization = user.memberships[0]?.organization ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result = await provider.send({
    fromName: organization?.name ?? "Provence 360",
    fromEmail: DEFAULT_FROM_EMAIL,
    toEmail: user.email,
    subject: "Réinitialisation de votre mot de passe",
    body: `<p>Bonjour,</p><p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valable 1 heure) :</p><p><a href="${appUrl}${resetPath}">${appUrl}${resetPath}</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    organizationId: organization?.id ?? "",
    messageId: `password-reset-${token}`,
  });

  if (result.status === "failed") {
    logger.warn({ userId: user.id, err: result.error }, "Échec de l'envoi de l'email de réinitialisation de mot de passe.");
  }

  // Jamais de lien dans la réponse dès qu'un fournisseur réel est configuré — même en cas d'échec d'envoi (voir avertissement ci-dessus, visible côté serveur/Sentry).
  return NextResponse.json({ ok: true });
}
