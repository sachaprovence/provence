import "server-only";
import { AgentMemoryScope } from "@/generated/prisma/enums";
import { setMemory } from "@/lib/agents/memory";
import { installationHasTool } from "@/lib/agents/permissions";
import type { AgentRuntime } from "@/lib/agents/types";

export const DIAGNOSTIC_AGENT_RUNTIME_KEY = "system.diagnostic-agent";

/**
 * Agent de référence unique de cette phase — **pas un agent métier**
 * (aucune valeur pour Provence 360 ni aucune activité). Son seul rôle est
 * de prouver, de bout en bout, que le Framework Agents fonctionne :
 * invocation d'outils (avec vérification de permission réelle), écriture
 * en mémoire, journalisation, et demande d'intervention conditionnelle.
 * Sert aussi de fixture pour les tests d'intégration
 * (`tests/agents/*.test.ts`).
 */
export const diagnosticAgentRuntime: AgentRuntime = {
  runtimeKey: DIAGNOSTIC_AGENT_RUNTIME_KEY,

  async execute(context) {
    await context.log("info", "Démarrage du diagnostic du Framework Agents.");

    const echoResult = await context.callTool("system.echo", { ping: "pong" });
    const { iso } = (await context.callTool("system.datetime", undefined)) as { iso: string };
    const { workspaceId } = (await context.callTool("system.workspace_info", undefined)) as {
      workspaceId: string;
    };

    await setMemory({
      workspaceId: context.installation.workspaceId,
      installationId: context.installation.id,
      scope: AgentMemoryScope.SHORT_TERM,
      key: "last_diagnostic_at",
      value: iso,
      ttlMs: 60 * 60 * 1000,
    });

    let leadsCounts: Record<string, number> | null = null;
    if (installationHasTool(context.installation, "crm.leads_count_by_stage")) {
      const result = (await context.callTool("crm.leads_count_by_stage", undefined)) as {
        counts: Record<string, number>;
      };
      leadsCounts = result.counts;
    }

    await context.log("info", "Diagnostic terminé.", { workspaceId });

    const input = context.input as { requestIntervention?: boolean } | null;

    return {
      output: { echoResult, timestamp: iso, workspaceId, leadsCounts },
      interventionRequested: input?.requestIntervention
        ? {
            title: "Vérification manuelle demandée par le diagnostic",
            description: "Demande déclenchée explicitement via l'entrée de l'exécution (requestIntervention=true).",
          }
        : undefined,
    };
  },
};
