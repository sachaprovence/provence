import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentActor } from "@/lib/auth";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { MembershipRole } from "@/generated/prisma/enums";

/**
 * Transfert de propriété d'une organisation (v1.4, AR-0178) — réutilise
 * `Membership`/`MembershipRole` tel quel plutôt que d'introduire une notion
 * de "propriétaire unique" séparée : le membre cible devient `OWNER_ADMIN`,
 * l'acteur qui transfère est rétrogradé `SALES` (renonce explicitement à
 * l'administration). Toujours atomique (transaction) : jamais d'état
 * intermédiaire où deux membres ou zéro membre seraient administrateur si
 * l'opération échoue à mi-chemin.
 */
export async function transferOrganizationOwnership(actor: CurrentActor, toUserId: string) {
  if (actor.membership.role !== MembershipRole.OWNER_ADMIN) {
    throw new ForbiddenError("Seul un administrateur de l'organisation peut transférer la propriété.");
  }
  if (toUserId === actor.user.id) {
    throw new ValidationError("Impossible de transférer la propriété à vous-même.");
  }

  const targetMembership = await prisma.membership.findFirst({
    where: { organizationId: actor.organization.id, userId: toUserId },
    include: { user: true },
  });
  if (!targetMembership) {
    throw new NotFoundError("Ce membre n'appartient pas à cette organisation.");
  }

  const [, updatedTarget] = await prisma.$transaction([
    prisma.membership.update({ where: { id: actor.membership.id }, data: { role: MembershipRole.SALES } }),
    prisma.membership.update({ where: { id: targetMembership.id }, data: { role: MembershipRole.OWNER_ADMIN } }),
  ]);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "organization.ownership_transferred",
    entityType: "Organization",
    entityId: actor.organization.id,
    metadata: { fromUserId: actor.user.id, toUserId },
  });

  return updatedTarget;
}

/**
 * Retrait DÉFINITIF d'un membre de l'organisation (v1.4, AR-0178) — distinct
 * du retrait d'un seul workspace (`removeWorkspaceMember`, déjà existant) :
 * supprime la `Membership` d'organisation ET toutes les `WorkspaceMembership`
 * de cette même organisation. Ne supprime jamais le `User` lui-même (peut
 * appartenir à d'autres organisations, et l'historique — auteur de notes,
 * de messages validés, etc. — doit rester consultable).
 *
 * Garde-fou non contournable : ne jamais retirer le dernier `OWNER_ADMIN` de
 * l'organisation (sinon plus personne ne pourrait plus l'administrer).
 */
export async function removeOrganizationMember(actor: CurrentActor, membershipId: string) {
  if (actor.membership.role !== MembershipRole.OWNER_ADMIN) {
    throw new ForbiddenError("Seul un administrateur de l'organisation peut retirer un membre.");
  }

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: actor.organization.id },
  });
  if (!membership) throw new NotFoundError("Membre introuvable.");

  if (membership.role === MembershipRole.OWNER_ADMIN) {
    const otherOwners = await prisma.membership.count({
      where: { organizationId: actor.organization.id, role: MembershipRole.OWNER_ADMIN, id: { not: membershipId } },
    });
    if (otherOwners === 0) {
      throw new ConflictError("Impossible de retirer le dernier administrateur de l'organisation — transférez d'abord la propriété.");
    }
  }

  await prisma.$transaction([
    prisma.workspaceMembership.deleteMany({
      where: { userId: membership.userId, workspace: { organizationId: actor.organization.id } },
    }),
    prisma.membership.delete({ where: { id: membershipId } }),
  ]);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "organization.member_removed",
    entityType: "Membership",
    entityId: membershipId,
    metadata: { removedUserId: membership.userId },
  });
}
