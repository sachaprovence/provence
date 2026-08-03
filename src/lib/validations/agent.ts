import { z } from "zod";

const workspacePermissionSchema = z.enum([
  "MANAGE_WORKSPACE",
  "MANAGE_MEMBERS",
  "MANAGE_LEADS",
  "VALIDATE_MESSAGES",
  "MANAGE_FINANCE",
  "EXECUTE_MISSIONS",
  "VIEW_WORKSPACE",
]);

export const installAgentSchema = z.object({
  definitionId: z.string().min(1),
  config: z.unknown().optional(),
  toolKeys: z.array(z.string()).default([]),
  permissions: z.array(workspacePermissionSchema).default([]),
});

export const updateAgentGrantsSchema = z.object({
  toolKeys: z.array(z.string()),
  permissions: z.array(workspacePermissionSchema),
});

export const updateAgentConfigSchema = z.object({
  config: z.unknown(),
});

export const createAgentRunSchema = z.object({
  input: z.unknown().optional(),
  priority: z.coerce.number().int().min(0).max(10).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(10 * 60 * 1000).optional(),
});

export const createAgentScheduleSchema = z
  .object({
    kind: z.enum(["ONE_OFF", "RECURRING", "EVENT"]),
    cronExpression: z.string().optional(),
    runAt: z.coerce.date().optional(),
    eventKey: z.string().optional(),
    input: z.unknown().optional(),
  })
  .refine((data) => data.kind !== "RECURRING" || !!data.cronExpression, {
    message: "cronExpression est requis pour une planification récurrente.",
    path: ["cronExpression"],
  })
  .refine((data) => data.kind !== "ONE_OFF" || !!data.runAt, {
    message: "runAt est requis pour une planification ponctuelle.",
    path: ["runAt"],
  })
  .refine((data) => data.kind !== "EVENT" || !!data.eventKey, {
    message: "eventKey est requis pour une planification événementielle.",
    path: ["eventKey"],
  });

export const resolveInterventionSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
});
