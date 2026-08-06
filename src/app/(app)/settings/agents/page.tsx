import Link from "next/link";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listCatalog, listInstallations } from "@/lib/agents/installation-service";
import { AgentsClient } from "@/components/agents-client";

export default async function AgentsPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de gérer les agents de ce workspace.</p>
      </div>
    );
  }

  const [catalog, installations] = await Promise.all([listCatalog(actor), listInstallations(actor)]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Agents IA</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Infrastructure du Framework Agents d&apos;Autorun — aucun agent métier n&apos;est encore proposé ici, seul
          un agent de référence sert à vérifier que l&apos;installation, l&apos;exécution, les outils, la mémoire et
          les permissions fonctionnent correctement. Pour créer votre propre agent conversationnel et discuter avec
          lui, voir <Link href="/agents" className="underline hover:text-p360-blue">Agents IA</Link>.
        </p>
      </div>

      <AgentsClient
        catalog={catalog.map((d) => ({
          id: d.id,
          key: d.key,
          name: d.name,
          description: d.description,
          version: d.version,
          author: d.author,
          category: d.category,
          icon: d.icon,
          declaredToolKeys: d.declaredToolKeys,
          declaredPermissions: d.declaredPermissions,
        }))}
        installations={installations.map((i) => ({
          id: i.id,
          status: i.status,
          grantedToolKeys: i.grantedToolKeys,
          grantedPermissions: i.grantedPermissions,
          definition: {
            id: i.definition.id,
            name: i.definition.name,
            icon: i.definition.icon,
            category: i.definition.category,
            version: i.definition.version,
          },
        }))}
      />
    </div>
  );
}
