import { z } from "zod";

/**
 * Validation de forme (zod) du graphe — la validation SÉMANTIQUE (cycles,
 * arêtes orphelines, branches condition manquantes...) vit dans
 * `src/lib/workflows/graph-validation.ts` et est appliquée par le service
 * (`workflow-service.ts`), pas ici : même séparation forme/métier que
 * `commercial.ts` (v0.5).
 */
const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["trigger", "condition", "action", "loop", "wait", "subworkflow", "end"]),
  position: z.object({ x: z.number(), y: z.number() }),
  label: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  branch: z.string().optional(),
});

const workflowVariableDeclarationSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["workflow", "context", "form"]),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  variables: z.array(workflowVariableDeclarationSchema).optional(),
});

const keySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "La clé ne doit contenir que des minuscules, chiffres et tirets.");

export const createWorkflowSchema = z.object({
  key: keySchema,
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  graph: workflowGraphSchema,
});

export const createVersionSchema = z.object({
  graph: workflowGraphSchema,
  changelog: z.string().optional(),
});

export const activateVersionSchema = z.object({ versionId: z.string().min(1) });

export const cloneWorkflowSchema = z.object({ newKey: keySchema, newName: z.string().min(1) });

export const importWorkflowSchema = z.object({
  key: keySchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().min(1),
  graph: workflowGraphSchema,
});

export const manualTriggerSchema = z.object({ input: z.unknown().optional() });

export const webhookTriggerParamsSchema = z.object({ workflowKey: keySchema });
