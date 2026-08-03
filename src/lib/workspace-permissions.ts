import "server-only";
import { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Permissions de workspace (voir ADR 0005/0006). Système additif,
 * indépendant de `src/lib/permissions.ts` (rôles d'organisation, inchangé
 * et toujours utilisé par toutes les routes métier existantes).
 */
export type WorkspacePermission =
  | "MANAGE_WORKSPACE" // renommer/archiver le workspace, gérer ses paramètres
  | "MANAGE_MEMBERS" // inviter, changer un rôle, retirer un membre
  | "MANAGE_LEADS" // créer/qualifier/relancer des prospects
  | "VALIDATE_MESSAGES" // valider un message généré avant envoi
  | "MANAGE_FINANCE" // devis, factures (futur), comptabilité
  | "EXECUTE_MISSIONS" // missions terrain, livrables
  | "MANAGE_WORKFLOWS" // créer/modifier/activer/déclencher un workflow (v0.6)
  | "MANAGE_AUTOMATIONS" // créer/modifier/activer/déclencher une automatisation, gérer ses jobs/DLQ (v0.8)
  | "VIEW_WORKSPACE"; // lecture seule sur tout le périmètre du workspace

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  OWNER: [
    "MANAGE_WORKSPACE",
    "MANAGE_MEMBERS",
    "MANAGE_LEADS",
    "VALIDATE_MESSAGES",
    "MANAGE_FINANCE",
    "EXECUTE_MISSIONS",
    "MANAGE_WORKFLOWS",
    "MANAGE_AUTOMATIONS",
    "VIEW_WORKSPACE",
  ],
  ADMIN: [
    "MANAGE_WORKSPACE",
    "MANAGE_MEMBERS",
    "MANAGE_LEADS",
    "VALIDATE_MESSAGES",
    "MANAGE_FINANCE",
    "EXECUTE_MISSIONS",
    "MANAGE_WORKFLOWS",
    "MANAGE_AUTOMATIONS",
    "VIEW_WORKSPACE",
  ],
  MANAGER: ["MANAGE_LEADS", "VALIDATE_MESSAGES", "EXECUTE_MISSIONS", "MANAGE_WORKFLOWS", "MANAGE_AUTOMATIONS", "VIEW_WORKSPACE"],
  COMMERCIAL: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
  OPERATOR: ["EXECUTE_MISSIONS", "VIEW_WORKSPACE"],
  ACCOUNTANT: ["MANAGE_FINANCE", "VIEW_WORKSPACE"],
  SUPPORT: ["VIEW_WORKSPACE"],
  VIEWER: ["VIEW_WORKSPACE"],
};

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Libellés d'affichage (français) des rôles de workspace — UI uniquement. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MANAGER: "Manager",
  COMMERCIAL: "Commercial",
  OPERATOR: "Opérateur",
  ACCOUNTANT: "Comptable",
  SUPPORT: "Support",
  VIEWER: "Lecture seule",
};

/** Noms d'action utilisés dans `AuditLog.action` pour les événements de workspace. */
export const WORKSPACE_AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: "organization.created",
  WORKSPACE_CREATED: "workspace.created",
  WORKSPACE_UPDATED: "workspace.updated",
  WORKSPACE_ARCHIVED: "workspace.archived",
  WORKSPACE_RESTORED: "workspace.restored",
  MEMBER_INVITED: "workspace_member.invited",
  MEMBER_ROLE_CHANGED: "workspace_member.role_changed",
  MEMBER_REMOVED: "workspace_member.removed",
  ACTIVE_WORKSPACE_CHANGED: "workspace.active_changed",
  ACCESS_DENIED: "access.denied",
} as const;
