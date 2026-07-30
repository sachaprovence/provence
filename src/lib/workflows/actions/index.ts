import "server-only";
import { registerWorkflowAction } from "./registry";
import { agentCallAction } from "./builtin/agent-action";
import { notificationCreateAction } from "./builtin/notification-action";
import { emailSendAction } from "./builtin/email-action";
import { httpCallApiAction } from "./builtin/http-action";
import { variableSetAction } from "./builtin/variable-action";
import { subworkflowRunAction } from "./builtin/subworkflow-action";
import { notYetImplementedActions } from "./builtin/not-yet-implemented-actions";

export * from "./registry";

/** Enregistrement idempotent — voir bootstrap.ts. */
export function registerBuiltInWorkflowActions(): void {
  registerWorkflowAction(agentCallAction);
  registerWorkflowAction(subworkflowRunAction);
  registerWorkflowAction(notificationCreateAction);
  registerWorkflowAction(emailSendAction);
  registerWorkflowAction(httpCallApiAction);
  registerWorkflowAction(variableSetAction);
  for (const action of notYetImplementedActions) registerWorkflowAction(action);
}
