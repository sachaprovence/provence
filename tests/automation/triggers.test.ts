import { describe, expect, it } from "vitest";
import { registerBuiltInAutomationTriggers } from "@/lib/automation/triggers";
import { listAutomationTriggerTypes } from "@/lib/automation/triggers/registry";
import { publishAutomationEvent, subscribeAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { clearAllDomainEventListeners } from "@/lib/events/domain-events";

describe("Automation Trigger Engine", () => {
  it("enregistre les 26 types de déclencheurs du brief, plus les évènements métier v0.9 (task #91) et v1.1 (AR-0165/AR-0167)", () => {
    registerBuiltInAutomationTriggers();
    expect(listAutomationTriggerTypes().length).toBe(39);
    const keys = listAutomationTriggerTypes().map((t) => t.key);
    expect(keys).toContain("schedule.cron");
    expect(keys).toContain("lead.created");
    expect(keys).toContain("agent.run.completed");
    expect(keys).toContain("custom");
    expect(keys).toContain("quote.sent");
    expect(keys).toContain("invoice.paid");
    expect(keys).toContain("virtual_tour.published");
    expect(keys).toContain("lead.stage_changed");
    expect(keys).toContain("virtual_tour.delivered");
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
