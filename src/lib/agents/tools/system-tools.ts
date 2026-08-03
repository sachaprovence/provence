import "server-only";
import type { ToolHandler } from "@/lib/agents/types";

/** Renvoie l'entrée telle quelle — outil de diagnostic pur, utile pour tester la tuyauterie du framework. */
export const echoTool: ToolHandler<unknown, { echoed: unknown }> = {
  key: "system.echo",
  async handle(input) {
    return { echoed: input };
  },
};

/** Renvoie l'horodatage serveur courant. */
export const datetimeTool: ToolHandler<void, { iso: string }> = {
  key: "system.datetime",
  async handle() {
    return { iso: new Date().toISOString() };
  },
};

/** Renvoie l'identité du workspace de l'installation appelante — aucune donnée sensible. */
export const workspaceInfoTool: ToolHandler<void, { workspaceId: string; organizationId: string }> = {
  key: "system.workspace_info",
  async handle(_input, { installation }) {
    return { workspaceId: installation.workspaceId, organizationId: installation.organizationId };
  },
};
