import "server-only";
import { ValidationError } from "@/lib/errors";
import type { AutomationJobHandler } from "../registry";

type VariableSetInput = { name: string; value: unknown };

/** Substitut sûr à "Exécuter un script" (même principe que `workflows/actions/builtin/variable-action.ts`, ADR 0020) : `value` a déjà traversé la même interpolation `{{ }}` que toute autre entrée de job. */
export const variableSetAction: AutomationJobHandler<VariableSetInput, { name: string; value: unknown }> = {
  key: "variable.set",
  name: "Définir une variable",
  description: 'Définit une variable "workflow.<nom>" à partir d\'une expression — substitut sûr à un script arbitraire.',
  category: "variables",
  async execute(input, context) {
    if (!input.name?.trim()) throw new ValidationError('Le job "variable.set" nécessite "name".');
    context.setVariable(input.name, input.value);
    await context.log("debug", `Variable "workflow.${input.name}" définie.`);
    return { name: input.name, value: input.value };
  },
};
