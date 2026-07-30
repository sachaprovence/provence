import { describe, expect, it } from "vitest";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";

/**
 * Permission `MANAGE_WORKFLOWS` (v0.6) — gate utilisé par toutes les routes
 * API de mutation du Workflow Engine (création/version/activation/
 * déclenchement/annulation/relance, voir `src/app/api/workflows/**`).
 */
describe("Workflow Engine — permission MANAGE_WORKFLOWS", () => {
  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MANAGER", true],
    ["COMMERCIAL", false],
    ["OPERATOR", false],
    ["ACCOUNTANT", false],
    ["SUPPORT", false],
    ["VIEWER", false],
  ] as const)("le rôle %s a MANAGE_WORKFLOWS : %s", (role, expected) => {
    expect(hasWorkspacePermission(role, "MANAGE_WORKFLOWS")).toBe(expected);
  });

  it("VIEW_WORKSPACE reste accordé à tous les rôles (lecture seule des workflows)", () => {
    const roles = ["OWNER", "ADMIN", "MANAGER", "COMMERCIAL", "OPERATOR", "ACCOUNTANT", "SUPPORT", "VIEWER"] as const;
    for (const role of roles) {
      expect(hasWorkspacePermission(role, "VIEW_WORKSPACE")).toBe(true);
    }
  });
});
