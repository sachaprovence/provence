import "server-only";
import { registerBuiltInAutomationTriggerTypes } from "./builtin-triggers";

let registered = false;

export function registerBuiltInAutomationTriggers(): void {
  if (registered) return;
  registered = true;
  registerBuiltInAutomationTriggerTypes();
}

export * from "./registry";
export * from "./event-dispatcher";
