import { describe, expect, it } from "vitest";
import { priorityLevelToValue, priorityValueToClosestLevel, AUTOMATION_PRIORITY } from "@/lib/automation/priority";

describe("Priority Manager", () => {
  it("convertit un niveau nommé ou un nombre en valeur numérique, NORMAL par défaut", () => {
    expect(priorityLevelToValue("HIGH")).toBe(AUTOMATION_PRIORITY.HIGH);
    expect(priorityLevelToValue(42)).toBe(42);
    expect(priorityLevelToValue(undefined)).toBe(AUTOMATION_PRIORITY.NORMAL);
  });

  it("trouve le niveau nommé le plus proche d'une valeur arbitraire", () => {
    expect(priorityValueToClosestLevel(0)).toBe("NORMAL");
    expect(priorityValueToClosestLevel(95)).toBe("CRITICAL");
    expect(priorityValueToClosestLevel(8)).toBe("HIGH");
  });
});
