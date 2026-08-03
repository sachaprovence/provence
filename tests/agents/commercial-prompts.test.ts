import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createPromptVersion,
  activatePromptVersion,
  getActivePrompt,
  listPromptVersions,
  renderPrompt,
} from "@/lib/agents/prompts/prompt-engine";
import { ValidationError, NotFoundError } from "@/lib/errors";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : moteur de
 * prompts (v0.5) — versionné, modifiable, testable, séparé du code.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("moteur de prompts", () => {
  const testKeys: string[] = [];

  afterAll(async () => {
    if (testKeys.length > 0) {
      await prisma.promptTemplate.deleteMany({ where: { key: { in: testKeys } } });
    }
  });

  it("crée la version 1 active par défaut, puis incrémente à chaque nouvelle version", async () => {
    const key = "test.prompt.versioning";
    testKeys.push(key);

    const v1 = await createPromptVersion({
      key,
      name: "Test",
      category: "test",
      template: "Bonjour {{name}}",
      variables: ["name"],
    });
    expect(v1.version).toBe(1);
    expect(v1.isActive).toBe(true);

    const v2 = await createPromptVersion({ key, name: "Test v2", category: "test", template: "Salut {{name}}", variables: ["name"] });
    expect(v2.version).toBe(2);
    expect(v2.isActive).toBe(true);

    const versions = await listPromptVersions(key);
    expect(versions).toHaveLength(2);
    // Une seule version active à la fois : la précédente a été désactivée.
    const v1Refreshed = versions.find((v) => v.version === 1);
    expect(v1Refreshed?.isActive).toBe(false);
  });

  it("permet de revenir à une version antérieure via activatePromptVersion", async () => {
    const key = "test.prompt.rollback";
    testKeys.push(key);

    await createPromptVersion({ key, name: "V1", category: "test", template: "v1", variables: [] });
    await createPromptVersion({ key, name: "V2", category: "test", template: "v2", variables: [] });

    const active = await getActivePrompt(key);
    expect(active.version).toBe(2);

    await activatePromptVersion(key, 1);
    const afterRollback = await getActivePrompt(key);
    expect(afterRollback.version).toBe(1);

    await expect(activatePromptVersion(key, 99)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rend un prompt en substituant ses variables déclarées, et refuse une variable manquante", async () => {
    const key = "test.prompt.render";
    testKeys.push(key);

    await createPromptVersion({
      key,
      name: "Rendu",
      category: "test",
      template: "Bonjour {{contactName}}, bienvenue chez {{companyName}}.",
      variables: ["contactName", "companyName"],
    });

    const rendered = await renderPrompt(key, { contactName: "Alice", companyName: "Acme" });
    expect(rendered.text).toBe("Bonjour Alice, bienvenue chez Acme.");
    expect(rendered.version).toBe(1);

    await expect(renderPrompt(key, { contactName: "Alice" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse de rendre une clé sans version active", async () => {
    await expect(renderPrompt("test.prompt.inexistant", {})).rejects.toBeInstanceOf(NotFoundError);
  });
});
