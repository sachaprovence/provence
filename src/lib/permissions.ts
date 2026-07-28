import { MembershipRole } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";

export function isAdmin(actor: CurrentActor) {
  return actor.membership.role === MembershipRole.OWNER_ADMIN;
}

export function isSales(actor: CurrentActor) {
  return actor.membership.role === MembershipRole.SALES;
}

export function isProvider(actor: CurrentActor) {
  return actor.membership.role === MembershipRole.PROVIDER;
}

/**
 * Un prestataire régional ne voit que les prospects/missions de son territoire.
 * Admin et commercial voient toute l'organisation.
 */
export function leadWhereForActor(actor: CurrentActor) {
  const base = { organizationId: actor.organization.id };
  if (isProvider(actor)) {
    return { ...base, territoryId: actor.membership.territoryId ?? "__none__" };
  }
  return base;
}

export function canValidateMessages(actor: CurrentActor) {
  return isAdmin(actor) || isSales(actor);
}

export function canManageOrganization(actor: CurrentActor) {
  return isAdmin(actor);
}

export function canManageUsers(actor: CurrentActor) {
  return isAdmin(actor);
}

/**
 * Un prestataire régional est limité aux prospects/missions de son territoire
 * (voir leadWhereForActor) et ne doit pas accéder aux fonctions commerciales
 * (campagnes, séquences, devis, rendez-vous...) ni à la configuration.
 */
export function canAccessSalesFeatures(actor: CurrentActor) {
  return isAdmin(actor) || isSales(actor);
}
