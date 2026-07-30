import "server-only";
import { prisma } from "@/lib/prisma";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { registerToolHandler } from "@/lib/agents/tool-registry";
import { echoTool, datetimeTool, workspaceInfoTool } from "@/lib/agents/tools/system-tools";
import { leadsCountByStageTool } from "@/lib/agents/tools/crm-tools";
import { placeholderTools } from "@/lib/agents/tools/placeholder-tools";
import { directorTools } from "@/lib/agents/tools/director-tools";
import { commercialTools } from "@/lib/agents/tools/commercial-tools";
import { diagnosticAgentRuntime, DIAGNOSTIC_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/diagnostic-agent";
import { directorAgentRuntime, DIRECTOR_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/director-agent";
import { commercialAgentRuntime, COMMERCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/commercial-agent";
import { FUTURE_AGENT_CONTRACTS } from "@/lib/agents/director/capability-contracts";
import { registerBuiltInScoringFactors } from "@/lib/agents/commercial/scoring-engine";
import { registerBuiltInLlmProviders } from "@/lib/agents/llm";
import { ensureCommercialPromptSeeds } from "@/lib/agents/commercial/prompt-seeds";
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
  {
    key: "commercial.create_prospect",
    name: "Créer une fiche prospect",
    description: "Crée un prospect géré par l'Agent Commercial.",
    category: "commercial",
  },
  {
    key: "commercial.search_prospects",
    name: "Rechercher des prospects",
    description: "Liste/filtre les prospects de l'installation (lecture seule).",
    category: "commercial",
  },
  {
    key: "commercial.enrich_prospect",
    name: "Enrichir un prospect",
    description: "Complète les informations connues d'un prospect (secteur, taille, site, contact).",
    category: "commercial",
  },
  {
    key: "commercial.qualify_prospect",
    name: "Qualifier un prospect",
    description: "Fait progresser un prospect dans le pipeline commercial.",
    category: "commercial",
  },
  {
    key: "commercial.score_prospect",
    name: "Attribuer un score",
    description: "Calcule et enregistre le score d'un prospect via le moteur de scoring.",
    category: "commercial",
  },
  {
    key: "commercial.estimate_potential",
    name: "Estimer le potentiel",
    description: "Estime la valeur potentielle d'un prospect (moteur de génération + prompt versionné).",
    category: "commercial",
  },
  {
    key: "commercial.draft_email",
    name: "Rédiger un premier email",
    description: "Génère un email de prise de contact personnalisé — jamais envoyé automatiquement.",
    category: "commercial",
  },
  {
    key: "commercial.draft_followup",
    name: "Préparer une relance",
    description: "Génère une relance personnalisée — jamais envoyée automatiquement.",
    category: "commercial",
  },
  {
    key: "commercial.draft_proposal",
    name: "Générer une proposition commerciale",
    description: "Génère une proposition commerciale — jamais envoyée automatiquement.",
    category: "commercial",
  },
  {
    key: "commercial.draft_quote",
    name: "Préparer un devis",
    description: "Prépare un devis (montant, lignes) — nécessite MANAGE_FINANCE, jamais envoyé automatiquement.",
    category: "commercial",
  },
  {
    key: "commercial.recommend_next_actions",
    name: "Proposer les prochaines actions",
    description: "Recommande la prochaine action pour un prospect, avec justification.",
    category: "commercial",
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
  for (const tool of commercialTools) registerToolHandler(tool);

  registerAgentRuntime(diagnosticAgentRuntime);
  registerAgentRuntime(directorAgentRuntime);
  registerAgentRuntime(commercialAgentRuntime);

  registerBuiltInScoringFactors();
  registerBuiltInLlmProviders();
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
 * Comme `ensureGlobalAgentDefinition`, mais **met à jour** la définition si
 * elle existe déjà (au lieu de la laisser inchangée) — nécessaire pour
 * "promouvoir" un stub `DRAFT` (v0.4, agent métier pas encore implémenté)
 * en agent réellement `PUBLISHED` une fois son `AgentRuntime` écrit (v0.5,
 * voir ADR 0012). `previousKeys` permet de retrouver la ligne existante
 * même si sa `key` change dans le même mouvement (ex.
 * `future-commercial-agent` -> `commercial-agent`) : la ligne est mise à
 * jour en place (même `id`), jamais recréée, pour ne jamais casser une
 * `AgentInstallation` qui la référence déjà par `definitionId`.
 */
async function promoteGlobalAgentDefinition(
  data: Parameters<typeof ensureGlobalAgentDefinition>[0] & { previousKeys?: string[] }
) {
  const existing = await prisma.agentDefinition.findFirst({
    where: { organizationId: null, key: { in: [data.key, ...(data.previousKeys ?? [])] } },
  });

  if (!existing) return ensureGlobalAgentDefinition(data);

  return prisma.agentDefinition.update({
    where: { id: existing.id },
    data: {
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

  // Premier agent MÉTIER d'Autorun (v0.5) : promotion du stub DRAFT créé en
  // v0.4 (`future-commercial-agent`) en agent réellement PUBLISHED, voir
  // ADR 0012 (le mécanisme était prévu dès v0.4) et ADR 0014.
  await promoteGlobalAgentDefinition({
    key: "commercial-agent",
    previousKeys: ["future-commercial-agent"],
    name: "Agent Commercial",
    description:
      "Gère le cycle commercial complet d'un prospect : recherche, qualification, enrichissement, scoring, estimation du potentiel, rédaction d'email/relance/proposition/devis, recommandation des prochaines actions. Aucune action n'est envoyée automatiquement sans validation humaine (voir ADR 0017).",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "commercial",
    icon: "💼",
    runtimeKey: COMMERCIAL_AGENT_RUNTIME_KEY,
    declaredToolKeys: [
      "commercial.create_prospect",
      "commercial.search_prospects",
      "commercial.enrich_prospect",
      "commercial.qualify_prospect",
      "commercial.score_prospect",
      "commercial.estimate_potential",
      "commercial.draft_email",
      "commercial.draft_followup",
      "commercial.draft_proposal",
      "commercial.draft_quote",
      "commercial.recommend_next_actions",
    ],
    declaredPermissions: ["MANAGE_LEADS", "MANAGE_FINANCE", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureCommercialPromptSeeds();
}
