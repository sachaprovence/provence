import "server-only";
import { NextResponse } from "next/server";
import type { MembershipRole } from "@/generated/prisma/enums";

/**
 * Rôles Compta Vellano ("Utilisateurs" — v2) : réutilise `MembershipRole`
 * (organisation), déjà lu partout ailleurs dans l'application pour ce
 * module, plutôt que d'introduire une dimension de permission
 * supplémentaire (`WorkspaceRole`/`workspace-permissions.ts` existe mais
 * n'est branché sur AUCUNE route métier réelle du dépôt aujourd'hui —
 * ajouter Compta comme seul module à s'y brancher créerait une
 * incohérence, pas une amélioration).
 *
 * - `OWNER_ADMIN` = Administrateur : accès complet.
 * - `SALES` = Employé : ventes/caisse/clients au jour le jour, jamais les
 *   écrans financiers (dépenses, fournisseurs, achats, stock, TVA,
 *   exports, sauvegarde) ni la suppression pure d'une vente.
 * - `PROVIDER` = Lecture seule : consultation uniquement (aucune route
 *   d'écriture Compta ne l'autorise).
 */

const FINANCE_ROLES: MembershipRole[] = ["OWNER_ADMIN"];
const OPERATIONAL_ROLES: MembershipRole[] = ["OWNER_ADMIN", "SALES"];

/** Ventes au jour le jour, sessions de caisse, clients — tâches d'un employé au comptoir. */
export function canManageComptaOperations(role: MembershipRole): boolean {
  return OPERATIONAL_ROLES.includes(role);
}

/** Dépenses, fournisseurs, achats, stock/recettes, TVA/exports, sauvegarde, suppression d'une vente — réservé à l'administrateur. */
export function canManageComptaFinance(role: MembershipRole): boolean {
  return FINANCE_ROLES.includes(role);
}

export function comptaForbiddenResponse(message = "Action réservée à l'administrateur de l'organisation.") {
  return NextResponse.json({ error: message }, { status: 403 });
}
