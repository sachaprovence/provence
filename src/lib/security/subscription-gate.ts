import "server-only";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Vérifie si l'organisation de la session porteuse du jeton est en statut
 * `RESTRICTED` (v1.0, AR-0063) — bascule après un échec de paiement
 * d'abonnement (voir `src/lib/billing/subscription-service.ts`). Écriture
 * bloquée, jamais de perte de données : appelé uniquement pour les
 * requêtes mutantes (voir `src/proxy.ts`), jamais pour la lecture.
 */
export async function isSessionOrganizationRestricted(sessionToken: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    select: {
      user: {
        select: {
          memberships: { take: 1, orderBy: { createdAt: "asc" }, select: { organization: { select: { subscriptionStatus: true } } } },
        },
      },
    },
  });

  const status = session?.user.memberships[0]?.organization.subscriptionStatus;
  return status === SubscriptionStatus.RESTRICTED;
}
