import { describe, expect, it } from "vitest";
import { registerBuiltInAutomationTriggers } from "@/lib/automation/triggers";
import { listAutomationTriggerTypes } from "@/lib/automation/triggers/registry";
import { publishAutomationEvent, subscribeAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { clearAllDomainEventListeners } from "@/lib/events/domain-events";

describe("Automation Trigger Engine", () => {
  it("enregistre les 26 types de déclencheurs du brief", () => {
    registerBuiltInAutomationTriggers();
    expect(listAutomationTriggerTypes().length).toBe(26);
    const keys = listAutomationTriggerTypes().map((t) => t.key);
    expect(keys).toContain("schedule.cron");
    expect(keys).toContain("lead.created");
    expect(keys).toContain("agent.run.completed");
    expect(keys).toContain("custom");
  });

  it("Event Dispatcher : réutilise le bus d'évènements générique, un abonné isolé n'empêche pas les autres", async () => {
    clearAllDomainEventListeners();
    const received: unknown[] = [];
    subscribeAutomationEvent("test.automation.event", async () => {
      throw new Error("abonné en échec");
    });
    subscribeAutomationEvent("test.automation.event", (payload) => {
      received.push(payload);
    });

    await publishAutomationEvent("test.automation.event", { hello: "world" });
    expect(received).toEqual([{ hello: "world" }]);
    clearAllDomainEventListeners();
  });
});
