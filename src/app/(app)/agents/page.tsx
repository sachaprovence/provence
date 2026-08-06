import Link from "next/link";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listCustomAgents, listAvailableTools, listAvailableLlmProviders } from "@/lib/agents/custom/custom-agent-service";
import { CustomAgentsClient } from "@/components/custom-agents-client";

export default async function CustomAgentsPage() {
  const actor = await requireWorkspaceActor();
  const canManage = hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE");

  const [agents, tools, providers] = await Promise.all([
    listCustomAgents(actor),
    listAvailableTools(),
    Promise.resolve(listAvailableLlmProviders()),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Agents IA</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Créez votre propre agent conversationnel : nom, prompt, fournisseur IA/modèle, outils autorisés et mémoire —
          puis discutez avec lui directement depuis cette page. Distinct du{" "}
          <Link href="/settings/agents" className="underline hover:text-p360-blue">
            catalogue d&apos;agents du Framework
          </Link>{" "}
          (agents métier préconçus, installables par l&apos;administrateur).
        </p>
      </div>

      <CustomAgentsClient
        agents={agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          providerKey: a.providerKey,
          model: a.model,
          toolKeys: a.toolKeys,
          memoryEnabled: a.memoryEnabled,
          createdAt: a.createdAt.toISOString(),
        }))}
        tools={tools.map((t) => ({ key: t.key, name: t.name, description: t.description, category: t.category }))}
        providers={providers}
        canManage={canManage}
      />
    </div>
  );
}
