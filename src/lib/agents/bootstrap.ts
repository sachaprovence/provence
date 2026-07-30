import "server-only";
import { prisma } from "@/lib/prisma";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { registerToolHandler } from "@/lib/agents/tool-registry";
import { echoTool, datetimeTool, workspaceInfoTool } from "@/lib/agents/tools/system-tools";
import { leadsCountByStageTool } from "@/lib/agents/tools/crm-tools";
import { placeholderTools } from "@/lib/agents/tools/placeholder-tools";
import { directorTools } from "@/lib/agents/tools/director-tools";
import { diagnosticAgentRuntime, DIAGNOSTIC_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/diagnostic-agent";
import { directorAgentRuntime, DIRECTOR_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/director-agent";
import { FUTURE_AGENT_CONTRACTS } from "@/lib/agents/director/capability-contracts";
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
  {
    key: "director.list_agents",
    name: "Lister les agents disponibles",
    description: "Agents actifs du workspace, pour choisir une cible de délégation.",
    category: "director",
  },
  {
    key: "director.delegate_task",
    name: "Déléguer une tâche",
    description: "Crée et exécute le run de l'agent cible d'une étape de plan, attend son résultat.",
    category: "director",
  },
  {
    key: "director.cancel_task",
    name: "Annuler une tâche déléguée",
    description: "Annule le run sous-jacent d'une étape de plan en attente ou en cours.",
    category: "director",
  },
  {
    key: "director.retry_task",
    name: "Relancer une tâche déléguée",
    description: "Relance une étape de plan en échec ou annulée (nouvelle exécution reliée à la précédente).",
    category: "director",
  },
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
  for (const tool of directorTools) registerToolHandler(tool);

  registerAgentRuntime(diagnosticAgentRuntime);
  registerAgentRuntime(directorAgentRuntime);
}

/**
 * Crée une `AgentDefinition` globale (organizationId nul) si elle n'existe
 * pas déjà, identifiée par sa `key`. Jamais un `upsert` sur
 * `(organizationId, key)` : NULL n'est jamais égal à NULL pour une
 * contrainte unique SQL, `upsert` ne peut donc pas cibler correctement une
 * ligne existante dont `organizationId` est nul (même limite que
 * `AgentMemoryEntry`, voir ADR 0009) — on vérifie donc explicitement
 * l'absence avant de créer.
 */
async function ensureGlobalAgentDefinition(data: {
  key: string;
  name: string;
  description: string;
  version: string;
  status: AgentDefinitionStatus;
  author: string;
  category: string;
  icon: string;
  runtimeKey: string;
  declaredToolKeys: string[];
  declaredPermissions: string[];
  defaultLimits?: Record<string, unknown>;
}) {
  const existing = await prisma.agentDefinition.findFirst({ where: { organizationId: null, key: data.key } });
  if (existing) return existing;

  return prisma.agentDefinition.create({
    data: {
      organizationId: null,
      key: data.key,
      name: data.name,
      description: data.description,
      version: data.version,
      status: data.status,
      author: data.author,
      category: data.category,
      icon: data.icon,
      runtimeKey: data.runtimeKey,
      declaredToolKeys: data.declaredToolKeys,
      declaredPermissions: data.declaredPermissions,
      compatibleAiModels: [],
      defaultLimits: (data.defaultLimits ?? null) as never,
    },
  });
}

/**
 * Synchronise le catalogue en base (`AgentTool`, `AgentDefinition`) avec
 * les composants enregistrés en code — additif et idempotent, appelable au
 * démarrage ou depuis `prisma/seed.ts`. Crée trois catégories de lignes :
 * le diagnostic de référence (v0.3), le Director (v0.4, seul agent
 * réellement installable au-delà du diagnostic), et des stubs `DRAFT` pour
 * les agents métier futurs (v0.4, jamais installables — voir
 * `capability-contracts.ts` et ADR 0012).
 */
export async function syncAgentCatalog() {
  for (const tool of AGENT_TOOL_CATALOG) {
    await prisma.agentTool.upsert({
      where: { key: tool.key },
      update: { name: tool.name, description: tool.description, category: tool.category },
      create: { ...tool, isBuiltIn: true },
    });
  }

  await ensureGlobalAgentDefinition({
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
    defaultLimits: { maxRunsPerDay: 100, maxConcurrentRuns: 1 },
  });

  await ensureGlobalAgentDefinition({
    key: "director-agent",
    name: "Agent Director",
    description:
      "Orchestrateur : reçoit une demande, la décompose en étapes, choisit et délègue aux agents adaptés, attend leurs résultats, les fusionne, gère les erreurs et produit une réponse finale. Ne réalise jamais lui-même de tâche métier.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "orchestration",
    icon: "🧭",
    runtimeKey: DIRECTOR_AGENT_RUNTIME_KEY,
    declaredToolKeys: [
      "director.list_agents",
      "director.delegate_task",
      "director.cancel_task",
      "director.retry_task",
    ],
    declaredPermissions: ["VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 5 },
  });

  for (const contract of FUTURE_AGENT_CONTRACTS) {
    await ensureGlobalAgentDefinition({
      key: contract.key,
      name: contract.name,
      description: contract.description,
      version: "0.0.0",
      status: AgentDefinitionStatus.DRAFT,
      author: "Autorun Framework (roadmap)",
      category: contract.category,
      icon: contract.icon,
      // Aucun runtime réel n'existe pour ces contrats — la clé documente
      // l'emplacement attendu, `getAgentRuntime` renverra `undefined` tant
      // qu'aucun `AgentRuntime` n'est enregistré sous cette clé (sans
      // conséquence : le statut DRAFT empêche déjà toute installation).
      runtimeKey: `future.${contract.category}-agent`,
      declaredToolKeys: contract.plannedToolKeys,
      declaredPermissions: contract.plannedPermissions,
    });
  }
}
