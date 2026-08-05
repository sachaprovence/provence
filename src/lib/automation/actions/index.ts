import "server-only";
import { registerAutomationJobHandler } from "./registry";
import { httpRequestAction } from "./builtin/http-action";
import { emailSendAction } from "./builtin/email-action";
import { notificationCreateAction } from "./builtin/notification-action";
import { variableSetAction } from "./builtin/variable-action";
import { agentCallAction } from "./builtin/agent-action";
import { workflowCallAction } from "./builtin/workflow-action";
import { automationCallAction } from "./builtin/automation-action";
import { knowledgeIndexAction } from "./builtin/knowledge-action";
import { memorySetAction } from "./builtin/memory-action";
import { leadCreateAction, leadUpdateAction, leadDeleteAction } from "./builtin/lead-actions";
import { taskCreateAction } from "./builtin/task-actions";
import { dailySummaryReportAction } from "./builtin/report-actions";
import { notYetImplementedActions } from "./builtin/not-yet-implemented-actions";

let registered = false;

/** Enregistrement idempotent — voir bootstrap.ts (même défensif qu'ADR 0013). */
export function registerBuiltInAutomationActions(): void {
  if (registered) return;
  registered = true;

  registerAutomationJobHandler(httpRequestAction);
  registerAutomationJobHandler(emailSendAction);
  registerAutomationJobHandler(notificationCreateAction);
  registerAutomationJobHandler(variableSetAction);
  registerAutomationJobHandler(agentCallAction);
  registerAutomationJobHandler(workflowCallAction);
  registerAutomationJobHandler(automationCallAction);
  registerAutomationJobHandler(knowledgeIndexAction);
  registerAutomationJobHandler(memorySetAction);
  registerAutomationJobHandler(leadCreateAction);
  registerAutomationJobHandler(leadUpdateAction);
  registerAutomationJobHandler(leadDeleteAction);
  registerAutomationJobHandler(taskCreateAction);
  registerAutomationJobHandler(dailySummaryReportAction);
  for (const action of notYetImplementedActions) registerAutomationJobHandler(action);
}

export * from "./registry";
