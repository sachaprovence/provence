import "server-only";
import { prisma } from "@/lib/prisma";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { registerToolHandler } from "@/lib/agents/tool-registry";
import { echoTool, datetimeTool, workspaceInfoTool } from "@/lib/agents/tools/system-tools";
import { leadsCountByStageTool } from "@/lib/agents/tools/crm-tools";
import { placeholderTools } from "@/lib/agents/tools/placeholder-tools";
import { directorTools } from "@/lib/agents/tools/director-tools";
import { commercialTools } from "@/lib/agents/tools/commercial-tools";
import { prospectionTools } from "@/lib/agents/tools/prospection-tools";
import { relanceTools } from "@/lib/agents/tools/relance-tools";
import { devisTools } from "@/lib/agents/tools/devis-tools";
import { planningTools } from "@/lib/agents/tools/planning-tools";
import { socialTools } from "@/lib/agents/tools/social-tools";
import { supportTools } from "@/lib/agents/tools/support-tools";
import { analyseTools } from "@/lib/agents/tools/analyse-tools";
import { visitesTools } from "@/lib/agents/tools/visites-tools";
import { diagnosticAgentRuntime, DIAGNOSTIC_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/diagnostic-agent";
import { directorAgentRuntime, DIRECTOR_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/director-agent";
import { commercialAgentRuntime, COMMERCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/commercial-agent";
import { qualificationAgentRuntime, QUALIFICATION_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/qualification-agent";
import { prospectionAgentRuntime, PROSPECTION_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/prospection-agent";
import { relanceAgentRuntime, RELANCE_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/relance-agent";
import { devisAgentRuntime, DEVIS_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/devis-agent";
import { planningAgentRuntime, PLANNING_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/planning-agent";
import { socialAgentRuntime, SOCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/social-agent";
import { supportAgentRuntime, SUPPORT_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/support-agent";
import { analyseAgentRuntime, ANALYSE_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/analyse-agent";
import { visitesAgentRuntime, VISITES_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/visites-agent";
import { FUTURE_AGENT_CONTRACTS } from "@/lib/agents/director/capability-contracts";
import { registerBuiltInScoringFactors } from "@/lib/agents/commercial/scoring-engine";
import { registerBuiltInLlmProviders } from "@/lib/agents/llm";
import { ensureCommercialPromptSeeds } from "@/lib/agents/commercial/prompt-seeds";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
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
  // Agents métier v0.9 (ADR 0038) — opèrent sur les VRAIES données CRM (Lead/Quote/Appointment/
  // VirtualTour/Conversation), jamais un modèle séparé de démonstration.
  {
    key: "prospection.find_priority_leads",
    name: "Trouver les prospects prioritaires",
    description: "Liste les prospects non travaillés, triés par score (lecture seule).",
    category: "prospection",
  },
  {
    key: "prospection.score_lead",
    name: "Scorer un prospect",
    description: "Calcule et enregistre le score réel d'un prospect (même moteur que /api/leads/[id]/score).",
    category: "prospection",
  },
  {
    key: "prospection.draft_outreach",
    name: "Rédiger un premier contact",
    description: "Génère un message de prise de contact — jamais envoyé automatiquement.",
    category: "prospection",
  },
  {
    key: "relance.find_stale_leads",
    name: "Trouver les prospects à relancer",
    description: "Liste les prospects sans réponse depuis un certain délai (lecture seule).",
    category: "relance",
  },
  {
    key: "relance.draft_followup",
    name: "Rédiger une relance",
    description: "Génère une relance ponctuelle — jamais envoyée automatiquement.",
    category: "relance",
  },
  {
    key: "devis.draft_quote",
    name: "Créer un devis",
    description: "Crée un devis réel (mêmes calculs que /quotes) — nécessite MANAGE_FINANCE.",
    category: "devis",
  },
  {
    key: "devis.send_quote",
    name: "Envoyer un devis",
    description: "Envoie un devis existant (fige une version, ADR 0038) — nécessite MANAGE_FINANCE.",
    category: "devis",
  },
  {
    key: "devis.recommend_pricing",
    name: "Recommander une approche tarifaire",
    description: "Recommande une approche tarifaire pour un prospect, sans fixer de montant.",
    category: "devis",
  },
  {
    key: "planning.check_availability",
    name: "Vérifier les disponibilités",
    description: "Lit les créneaux occupés (Google Calendar réel ou repli sur les rendez-vous enregistrés).",
    category: "planning",
  },
  {
    key: "planning.book_appointment",
    name: "Réserver un rendez-vous",
    description: "Crée un rendez-vous réel, synchronisé avec Google Calendar si connecté.",
    category: "planning",
  },
  {
    key: "planning.suggest_slots",
    name: "Suggérer des créneaux",
    description: "Calcule les créneaux libres à partir des créneaux occupés fournis (calcul déterministe).",
    category: "planning",
  },
  {
    key: "social.list_recent_published_tours",
    name: "Lister les visites récemment publiées",
    description: "Liste les visites 3D publiées, candidates à une publication (lecture seule).",
    category: "social",
  },
  {
    key: "social.draft_post",
    name: "Rédiger une publication",
    description: "Génère un texte de publication pour une visite 3D publiée — la publication réelle reste manuelle (aucune API sociale connectée).",
    category: "social",
  },
  {
    key: "support.summarize_conversation",
    name: "Résumer une conversation",
    description: "Résume l'historique réel des échanges avec un prospect/client.",
    category: "support",
  },
  {
    key: "support.draft_reply",
    name: "Rédiger une réponse",
    description: "Répond au dernier message entrant — jamais envoyé automatiquement.",
    category: "support",
  },
  {
    key: "analyse.generate_report",
    name: "Générer un rapport",
    description: "Synthèse narrative des statistiques réelles de l'organisation.",
    category: "analyse",
  },
  {
    key: "analyse.detect_stalled_leads",
    name: "Détecter les prospects bloqués",
    description: "Liste les prospects sans progression depuis un certain délai (lecture seule).",
    category: "analyse",
  },
  // Agent Visites (v1.1, AR-0174) — surveille le pipeline des visites 3D lui-même.
  {
    key: "visites.detect_stalled_tours",
    name: "Détecter les visites bloquées",
    description: "Liste les visites 3D bloquées trop longtemps à un statut (lecture seule).",
    category: "visites",
  },
  {
    key: "visites.request_technician_followup",
    name: "Relancer un technicien",
    description: "Crée une notification de relance pour une visite 3D bloquée.",
    category: "visites",
  },
  {
    key: "visites.advance_status",
    name: "Changer le statut d'une visite",
    description: "Fait avancer le statut d'une visite 3D (mêmes règles que /visits).",
    category: "visites",
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
  for (const tool of prospectionTools) registerToolHandler(tool);
  for (const tool of relanceTools) registerToolHandler(tool);
  for (const tool of devisTools) registerToolHandler(tool);
  for (const tool of planningTools) registerToolHandler(tool);
  for (const tool of socialTools) registerToolHandler(tool);
  for (const tool of supportTools) registerToolHandler(tool);
  for (const tool of analyseTools) registerToolHandler(tool);
  for (const tool of visitesTools) registerToolHandler(tool);

  registerAgentRuntime(diagnosticAgentRuntime);
  registerAgentRuntime(directorAgentRuntime);
  registerAgentRuntime(commercialAgentRuntime);
  registerAgentRuntime(qualificationAgentRuntime);
  registerAgentRuntime(prospectionAgentRuntime);
  registerAgentRuntime(relanceAgentRuntime);
  registerAgentRuntime(devisAgentRuntime);
  registerAgentRuntime(planningAgentRuntime);
  registerAgentRuntime(socialAgentRuntime);
  registerAgentRuntime(supportAgentRuntime);
  registerAgentRuntime(analyseAgentRuntime);
  registerAgentRuntime(visitesAgentRuntime);

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

  // Agent Qualification (v1.1, AR-0173) — extrait de l'Agent Commercial pour
  // être orchestrable indépendamment (workflow/automatisation), sans
  // dupliquer le moteur de scoring : réutilise directement les outils
  // `commercial.score_prospect`/`commercial.qualify_prospect` déjà déclarés
  // ci-dessus.
  await ensureGlobalAgentDefinition({
    key: "qualification-agent",
    name: "Agent Qualification",
    description:
      "Qualifie un prospect existant (score + étape du pipeline) sans lancer tout le cycle commercial — mêmes outils et même moteur de scoring que l'Agent Commercial, orchestrable indépendamment par un workflow ou une automatisation.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "commercial",
    icon: "🎓",
    runtimeKey: QUALIFICATION_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["commercial.score_prospect", "commercial.qualify_prospect"],
    declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  // 7 agents métier v0.9 (ADR 0038) — opèrent sur les VRAIES données CRM
  // (Lead/Quote/Appointment/VirtualTour/Conversation), jamais un modèle
  // séparé de démonstration comme `CommercialProspect`. Support et Analyse
  // PROMEUVENT les stubs DRAFT créés en v0.4 (même mécanisme que
  // Commercial en v0.5) ; les cinq autres n'avaient pas de stub
  // correspondant et sont créés directement PUBLISHED.
  await ensureGlobalAgentDefinition({
    key: "prospection-agent",
    name: "Agent Prospection",
    description:
      "Identifie et priorise les prospects existants les plus prometteurs (score réel), rédige le premier message de prise de contact. Aucun envoi automatique (ADR 0017).",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "prospection",
    icon: "🎯",
    runtimeKey: PROSPECTION_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["prospection.find_priority_leads", "prospection.score_lead", "prospection.draft_outreach"],
    declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureGlobalAgentDefinition({
    key: "relance-agent",
    name: "Agent Relance",
    description:
      "Identifie les prospects restés sans réponse en dehors de toute séquence programmée et rédige une relance ponctuelle. Aucun envoi automatique (ADR 0017).",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "relance",
    icon: "🔁",
    runtimeKey: RELANCE_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["relance.find_stale_leads", "relance.draft_followup"],
    declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureGlobalAgentDefinition({
    key: "devis-agent",
    name: "Agent Devis",
    description: "Crée et envoie de vrais devis (mêmes calculs que /quotes), recommande une approche tarifaire.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "devis",
    icon: "🧾",
    runtimeKey: DEVIS_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["devis.draft_quote", "devis.send_quote", "devis.recommend_pricing"],
    declaredPermissions: ["MANAGE_FINANCE", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureGlobalAgentDefinition({
    key: "planning-agent",
    name: "Agent Planning",
    description: "Vérifie les disponibilités (Google Calendar réel) et réserve de vrais rendez-vous, synchronisés.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "planning",
    icon: "📅",
    runtimeKey: PLANNING_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["planning.check_availability", "planning.book_appointment", "planning.suggest_slots"],
    declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureGlobalAgentDefinition({
    key: "social-agent",
    name: "Agent Réseaux sociaux",
    description:
      "Rédige des publications pour de vraies visites 3D publiées. La publication réelle reste manuelle (aucune API sociale connectée dans cet environnement, voir ADR 0038).",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "social",
    icon: "📱",
    runtimeKey: SOCIAL_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["social.list_recent_published_tours", "social.draft_post"],
    declaredPermissions: ["VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  // Promotion du stub DRAFT créé en v0.4 (`future-support-agent`), même mécanisme que Commercial (v0.5).
  await promoteGlobalAgentDefinition({
    key: "support-agent",
    previousKeys: ["future-support-agent"],
    name: "Agent Support",
    description:
      "Résume l'historique réel des échanges avec un prospect/client et rédige une réponse. Aucun envoi automatique (ADR 0017).",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "support",
    icon: "🎧",
    runtimeKey: SUPPORT_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["support.summarize_conversation", "support.draft_reply"],
    declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  // Promotion du stub DRAFT créé en v0.4 (`future-analyse-agent`), même mécanisme que Commercial (v0.5).
  await promoteGlobalAgentDefinition({
    key: "analyse-agent",
    previousKeys: ["future-analyse-agent"],
    name: "Agent Analyse",
    description: "Génère un rapport narratif à partir des statistiques réelles de l'organisation et détecte les prospects bloqués.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "analyse",
    icon: "📊",
    runtimeKey: ANALYSE_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["analyse.generate_report", "analyse.detect_stalled_leads"],
    declaredPermissions: ["VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  // Agent Visites (v1.1, AR-0174) — surveille le pipeline des visites 3D
  // lui-même, complémentaire de l'Agent Réseaux sociaux (qui n'agit
  // qu'APRÈS publication).
  await ensureGlobalAgentDefinition({
    key: "visites-agent",
    name: "Agent Visites",
    description:
      "Détecte les visites 3D bloquées trop longtemps à un statut (planifiée non tournée, tournée non traitée, en traitement non publiée) et peut proposer une relance technicien ou déclencher un changement de statut.",
    version: "0.1.0",
    status: AgentDefinitionStatus.PUBLISHED,
    author: "Autorun Framework",
    category: "visites",
    icon: "🎥",
    runtimeKey: VISITES_AGENT_RUNTIME_KEY,
    declaredToolKeys: ["visites.detect_stalled_tours", "visites.request_technician_followup", "visites.advance_status"],
    declaredPermissions: ["EXECUTE_MISSIONS", "VIEW_WORKSPACE"],
    defaultLimits: { maxRunsPerDay: 200, maxConcurrentRuns: 3 },
  });

  await ensureCommercialPromptSeeds();
  await ensureBusinessAgentPromptSeeds();
}
