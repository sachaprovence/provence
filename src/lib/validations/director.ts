import { z } from "zod";

/**
 * Entrée d'une demande adressée au Director (v0.4). `steps`, s'il est
 * fourni, court-circuite la décomposition heuristique
 * (`src/lib/agents/director/decomposition.ts`, voir ADR 0011) — c'est le
 * point d'extension prévu pour un futur module de décomposition réel
 * (NLU/LLM) sans changer le moteur de planification lui-même.
 */
const planStepInputSchema = z
  .object({
    objective: z.string().min(1),
    targetInstallationId: z.string().optional(),
    targetCategory: z.string().optional(),
    priority: z.number().int().min(0).max(10).optional(),
    dependsOn: z.array(z.number().int().min(0)).optional(),
    requiredToolKeys: z.array(z.string()).optional(),
    requiredPermissions: z.array(z.string()).optional(),
    input: z.unknown().optional(),
  })
  .refine((step) => !!step.targetInstallationId || !!step.targetCategory, {
    message: "Chaque étape doit préciser targetInstallationId ou targetCategory.",
  });

export const directorRequestSchema = z.object({
  objective: z.string().min(1, "L'objectif est requis."),
  steps: z.array(planStepInputSchema).optional(),
});

export type DirectorRequestInput = z.infer<typeof directorRequestSchema>;

export const directorRunRequestSchema = z.object({
  objective: z.string().min(1),
  steps: z.array(planStepInputSchema).optional(),
  priority: z.coerce.number().int().min(0).max(10).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(10 * 60 * 1000).optional(),
});
