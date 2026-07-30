import "server-only";
import { prisma } from "@/lib/prisma";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { registerToolHandler } from "@/lib/agents/tool-registry";
import { echoTool, datetimeTool, workspaceInfoTool } from "@/lib/agents/tools/system-tools";
import { leadsCountByStageTool } from "@/lib/agents/tools/crm-tools";
import { placeholderTools } from "@/lib/agents/tools/placeholder-tools";
import { diagnosticAgentRuntime, DIAGNOSTIC_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/diagnostic-agent";
import { AgentDefinitionStatus } from "@/generated/prisma/enums";

/** Déclaration des outils du registre (voir prisma/schema.prisma#AgentTool). */
export const AGENT_TOOL_CATALOG = [
  { key: echoTool.key, name: "Écho", description: "Renvoie l'entrée telle quelle — diagnostic.", category: "system" },
  { key: datetimeTool.key, name: "Horodatage", description: "Renvoie l'heure serveur courante.", category: "system" },
  {
    key: workspaceInfoTool.key,
    name: "Identité du workspace",
    description: "Renvoie l'identifiant du workspace appelant.",
    category: "system",
  },
  {
    key: leadsCountByStageTool.key,
    name: "Comptage des prospects par étape",
    description: "Lecture seule, agrégée — nécessite la permission VIEW_WORKSPACE.",
    category: "crm",
  },
  { key: "database.query", name: "Requête base de données", description: "Non implémenté.", category: "database" },
  { key: "email.send", name: "Envoi d'email", description: "Non implémenté.", category: "email" },
  { key: "calendar.create_event", name: "Création d'évènement calendrier", description: "Non implémenté.", category: "calendar" },
  { key: "documents.generate", name: "Génération de document", description: "Non implémenté.", category: "documents" },
  { key: "api.call_external", name: "Appel API externe", description: "Non implémenté.", category: "api" },
  { key: "search.web", name: "Recherche web", description: "Non implémenté.", category: "search" },
  { key: "files.read", name: "Lecture de fichier", description: "Non implémenté.", category: "files" },
  { key: "pdf.generate", name: "Génération PDF", description: "Non implémenté.", category: "pdf" },
] as const;

let registered = false;

/**
 * Enregistre les runtimes et outils du Framework Agents. Idempotent
 * (protégé par `registered`) : peut être appelé plusieurs fois sans effet
 * de bord (rechargement à chaud en développement, plusieurs imports).
 */
export function registerBuiltInAgentComponents() {
  if (registered) return;
  registered = true;

  registerToolHandler(echoTool);
  registerToolHandler(datetimeTool);
  registerToolHandler(workspaceInfoTool);
  registerToolHandler(leadsCountByStageTool);
  for (const tool of placeholderTools) registerToolHandler(tool);

  registerAgentRuntime(diagnosticAgentRuntime);
}

/**
 * Synchronise le catalogue en base (`AgentTool`, `AgentDefinition`) avec
 * les composants enregistrés en code — additif et idempotent (upsert),
 * appelable au démarrage ou depuis `prisma/seed.ts`. Ne crée qu'un seul
 * agent : le diagnostic de référence (voir
 * `src/lib/agents/definitions/diagnostic-agent.ts`), explicitement pas un
 * agent métier.
 */
export async function syncAgentCatalog() {
  for (const tool of AGENT_TOOL_CATALOG) {
    await prisma.agentTool.upsert({
      where: { key: tool.key },
      update: { name: tool.name, description: tool.description, category: tool.category },
      create: { ...tool, isBuiltIn: true },
    });
  }

  // `@@unique([organizationId, key])` ne peut pas empêcher deux définitions
  // globales (organizationId NULL) de partager la même clé — NULL n'est
  // jamais égal à NULL pour une contrainte unique SQL (même limite que
  // `AgentMemoryEntry`, voir ADR 0009). On vérifie donc explicitement
  // l'absence avant création plutôt que d'utiliser `upsert` sur cette clé.
  const existingDiagnosticAgent = await prisma.agentDefinition.findFirst({
    where: { organizationId: null, key: "diagnostic-agent" },
  });
  if (!existingDiagnosticAgent) {
    await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: "diagnostic-agent",
        name: "Agent de diagnostic (Framework)",
        description:
          "Agent de référence sans valeur métier : vérifie que l'installation, l'exécution, les outils, la mémoire et les permissions du Framework Agents fonctionnent correctement.",
        version: "0.1.0",
        status: AgentDefinitionStatus.PUBLISHED,
        author: "Autorun Framework",
        category: "system",
        icon: "🩺",
        runtimeKey: DIAGNOSTIC_AGENT_RUNTIME_KEY,
        declaredToolKeys: [echoTool.key, datetimeTool.key, workspaceInfoTool.key, leadsCountByStageTool.key],
        declaredPermissions: ["VIEW_WORKSPACE"],
        compatibleAiModels: [],
        defaultLimits: { maxRunsPerDay: 100, maxConcurrentRuns: 1 },
      },
    });
  }
}
