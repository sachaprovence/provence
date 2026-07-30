import { describe, expect, it } from "vitest";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";

/**
 * Permission `MANAGE_AUTOMATIONS` (v0.8) — gate utilisé par toutes les
 * routes API de mutation de l'Automation Engine (création/version/
 * activation/déclenchement/annulation/relance/DLQ, voir
 * `src/app/api/automations/**`). Même distribution de rôles que
 * `MANAGE_WORKFLOWS`, délibérément (v0.6).
 */
describe("Automation Engine — permission MANAGE_AUTOMATIONS", () => {
  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MANAGER", true],
    ["COMMERCIAL", false],
    ["OPERATOR", false],
    ["ACCOUNTANT", false],
    ["SUPPORT", false],
    ["VIEWER", false],
  ] as const)("le rôle %s a MANAGE_AUTOMATIONS : %s", (role, expected) => {
    expect(hasWorkspacePermission(role, "MANAGE_AUTOMATIONS")).toBe(expected);
  });

  it("VIEW_WORKSPACE reste accordé à tous les rôles (lecture seule des automatisations)", () => {
    const roles = ["OWNER", "ADMIN", "MANAGER", "COMMERCIAL", "OPERATOR", "ACCOUNTANT", "SUPPORT", "VIEWER"] as const;
    for (const role of roles) {
      expect(hasWorkspacePermission(role, "VIEW_WORKSPACE")).toBe(true);
    }
  });
});
