import "server-only";
import { ValidationError } from "@/lib/errors";
import type { WorkflowActionHandler } from "../registry";

type VariableSetInput = { name: string; value: unknown };

/**
 * Substitut sûr à "Exécuter un script" (voir ADR 0020) : `value` a déjà
 * traversé la même interpolation `{{ }}` que toute autre entrée d'action
 * (voir `execution-engine.ts`), donc ce bloc permet déjà de calculer/
 * recombiner des variables sans jamais évaluer de code arbitraire.
 */
export const variableSetAction: WorkflowActionHandler<VariableSetInput, { name: string; value: unknown }> = {
  key: "variable.set",
  name: "Définir une variable",
  description: 'Définit une variable "workflow.<nom>" à partir d\'une expression — substitut sûr à un script arbitraire.',
  category: "variables",
  async execute(input, context) {
    if (!input.name?.trim()) throw new ValidationError('L\'action "variable.set" nécessite "name".');
    context.setVariable(input.name, input.value);
    await context.log("debug", `Variable "workflow.${input.name}" définie.`);
    return { name: input.name, value: input.value };
  },
};
