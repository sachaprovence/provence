import { describe, expect, it } from "vitest";
import { evaluateRule, resolveActionInput, resolveExpr } from "@/lib/workflows/expressions/evaluator";
import { createEmptyVariableContext, getPath, setPath } from "@/lib/workflows/expressions/variable-context";
import { registerConditionOperator } from "@/lib/workflows/conditions/registry";

/**
 * Moteur d'expressions/de règles (voir ADR 0019/0020) — tests unitaires
 * purs, sans base de données : résolution de variables, interpolation
 * `{{ }}`, et chaque opérateur du moteur de règles.
 */
describe("Workflow Engine — variables et expressions", () => {
  function ctx() {
    const c = createEmptyVariableContext({ organizationId: "org1", workspaceId: "ws1", permissions: ["VIEW_WORKSPACE"] });
    c.context = { score: 75, name: "Sacha", subject: "Ceci est URGENT", items: ["a", "b"], overdue: true };
    c.results = { node1: { score: 42 } };
    return c;
  }

  it("résout un chemin simple et un chemin indexé", () => {
    const c = ctx();
    expect(getPath(c, "context.score")).toBe(75);
    expect(getPath(c, "context.items[0]")).toBe("a");
    expect(getPath(c, "results.node1.score")).toBe(42);
    expect(getPath(c, "context.missing")).toBeUndefined();
  });

  it("setPath ne mute pas le contexte d'origine (copie superficielle)", () => {
    const c = ctx();
    const updated = setPath(c, "workflow.foo", 123);
    expect(getPath(c, "workflow.foo")).toBeUndefined();
    expect(getPath(updated, "workflow.foo")).toBe(123);
  });

  it("resolveExpr renvoie une valeur littérale ou une variable", () => {
    const c = ctx();
    expect(resolveExpr({ kind: "literal", value: 10 }, c)).toBe(10);
    expect(resolveExpr({ kind: "var", path: "context.name" }, c)).toBe("Sacha");
  });

  it("resolveActionInput préserve le type sur une correspondance exacte et interpole une chaîne mixte", () => {
    const c = ctx();
    expect(resolveActionInput("{{ context.score }}", c)).toBe(75);
    expect(resolveActionInput("Bonjour {{ context.name }} !", c)).toBe("Bonjour Sacha !");
    expect(resolveActionInput({ title: "Score: {{ context.score }}", raw: "{{ results.node1 }}" }, c)).toEqual({
      title: "Score: 75",
      raw: { score: 42 },
    });
    expect(resolveActionInput(["{{ context.name }}", 5], c)).toEqual(["Sacha", 5]);
  });

  const cases: { name: string; rule: Parameters<typeof evaluateRule>[0]; expected: boolean }[] = [
    { name: "true", rule: { op: "true" }, expected: true },
    { name: "eq vrai", rule: { op: "eq", left: { kind: "var", path: "context.name" }, right: { kind: "literal", value: "Sacha" } }, expected: true },
    { name: "neq vrai", rule: { op: "neq", left: { kind: "var", path: "context.name" }, right: { kind: "literal", value: "Autre" } }, expected: true },
    { name: "gt vrai", rule: { op: "gt", left: { kind: "var", path: "context.score" }, right: { kind: "literal", value: 50 } }, expected: true },
    { name: "gte vrai (égalité)", rule: { op: "gte", left: { kind: "literal", value: 50 }, right: { kind: "literal", value: 50 } }, expected: true },
    { name: "lt faux", rule: { op: "lt", left: { kind: "var", path: "context.score" }, right: { kind: "literal", value: 50 } }, expected: false },
    { name: "lte vrai", rule: { op: "lte", left: { kind: "literal", value: 50 }, right: { kind: "literal", value: 50 } }, expected: true },
    {
      name: "and (deux vrais)",
      rule: { op: "and", rules: [{ op: "true" }, { op: "eq", left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 1 } }] },
      expected: true,
    },
    { name: "or (un vrai)", rule: { op: "or", rules: [{ op: "eq", left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 2 } }, { op: "true" }] }, expected: true },
    { name: "not", rule: { op: "not", rule: { op: "true" } }, expected: false },
    { name: "regex", rule: { op: "regex", value: { kind: "var", path: "context.subject" }, pattern: "urgent", flags: "i" }, expected: true },
    { name: "exists (vrai)", rule: { op: "exists", value: { kind: "var", path: "context.name" } }, expected: true },
    { name: "exists (faux)", rule: { op: "exists", value: { kind: "var", path: "context.missing" } }, expected: false },
    { name: "in", rule: { op: "in", value: { kind: "literal", value: "a" }, list: [{ kind: "var", path: "context.items[0]" }] }, expected: true },
    {
      name: "date_before",
      rule: { op: "date_before", left: { kind: "literal", value: "2020-01-01" }, right: { kind: "literal", value: "2021-01-01" } },
      expected: true,
    },
    {
      name: "date_after",
      rule: { op: "date_after", left: { kind: "literal", value: "2022-01-01" }, right: { kind: "literal", value: "2021-01-01" } },
      expected: true,
    },
    { name: "permission (accordée)", rule: { op: "permission", permission: "VIEW_WORKSPACE" }, expected: true },
    { name: "permission (non accordée)", rule: { op: "permission", permission: "MANAGE_WORKFLOWS" }, expected: false },
  ];

  it.each(cases)("évalue correctement l'opérateur : $name", ({ rule, expected }) => {
    expect(evaluateRule(rule, ctx())).toBe(expected);
  });

  it("combine récursivement and/or/not (règles imbriquées)", () => {
    const c = ctx();
    const rule = {
      op: "and" as const,
      rules: [
        { op: "gt" as const, left: { kind: "var" as const, path: "context.score" }, right: { kind: "literal" as const, value: 10 } },
        { op: "not" as const, rule: { op: "eq" as const, left: { kind: "var" as const, path: "context.name" }, right: { kind: "literal" as const, value: "Autre" } } },
      ],
    };
    expect(evaluateRule(rule, c)).toBe(true);
  });

  it("l'opérateur 'custom' non enregistré lève une erreur explicite", () => {
    expect(() => evaluateRule({ op: "custom", key: "inconnu", args: [] }, ctx())).toThrow(/non enregistré/);
  });

  it("l'opérateur 'custom' enregistré est appelé avec les arguments résolus", () => {
    registerConditionOperator("test.always-even", (args) => (args[0] as number) % 2 === 0);
    expect(evaluateRule({ op: "custom", key: "test.always-even", args: [{ kind: "literal", value: 4 }] }, ctx())).toBe(true);
    expect(evaluateRule({ op: "custom", key: "test.always-even", args: [{ kind: "literal", value: 3 }] }, ctx())).toBe(false);
  });
});
