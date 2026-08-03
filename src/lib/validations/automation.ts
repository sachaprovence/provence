import { z } from "zod";

/**
 * Validation de forme (zod) du graphe — la validation SÉMANTIQUE (cycles,
 * arêtes orphelines, branches condition/switch manquantes...) vit dans
 * `src/lib/automation/graph-validation.ts` et est appliquée par le service
 * (`automation-service.ts`), pas ici : même séparation forme/métier que
 * `workflow.ts` (v0.6).
 */
const automationNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["trigger", "condition", "switch", "action", "loop", "map", "wait", "join", "subautomation", "end"]),
  position: z.object({ x: z.number(), y: z.number() }),
  label: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

const automationEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  branch: z.string().optional(),
});

const automationVariableDeclarationSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["workflow", "context", "form"]),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
});

export const automationGraphSchema = z.object({
  nodes: z.array(automationNodeSchema),
  edges: z.array(automationEdgeSchema),
  variables: z.array(automationVariableDeclarationSchema).optional(),
});

const keySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "La clé ne doit contenir que des minuscules, chiffres et tirets.");

export const createAutomationSchema = z.object({
  key: keySchema,
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  graph: automationGraphSchema,
});

export const createAutomationVersionSchema = z.object({
  graph: automationGraphSchema,
  changelog: z.string().optional(),
});

export const activateAutomationVersionSchema = z.object({ versionId: z.string().min(1) });

export const cloneAutomationSchema = z.object({ newKey: keySchema, newName: z.string().min(1) });

export const importAutomationSchema = z.object({
  key: keySchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().min(1),
  graph: automationGraphSchema,
});

export const manualAutomationRunSchema = z.object({ input: z.unknown().optional() });
