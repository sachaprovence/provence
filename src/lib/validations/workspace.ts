import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(150),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(SLUG_PATTERN, "Lettres minuscules, chiffres et tirets uniquement."),
  description: z.string().max(2000).optional().nullable(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional().nullable(),
});

export const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "COMMERCIAL", "OPERATOR", "ACCOUNTANT", "SUPPORT", "VIEWER"]),
});

export const changeWorkspaceMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "COMMERCIAL", "OPERATOR", "ACCOUNTANT", "SUPPORT", "VIEWER"]),
});

export const setActiveWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

export const acceptWorkspaceInvitationSchema = z.object({
  // Renseigné uniquement si l'invité n'a pas encore de compte.
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
});
