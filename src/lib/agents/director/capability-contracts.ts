/**
 * Contrats des futurs agents métier (v0.4) — **aucune implémentation**,
 * uniquement des types TypeScript et une déclaration de catalogue. Aucun
 * de ces domaines n'a de `runtimeKey` enregistré (`registry.ts`) : leur
 * `AgentDefinition` correspondante (voir `bootstrap.ts`) reste au statut
 * `DRAFT`, donc jamais installable (`installAgent` n'accepte que les
 * définitions `PUBLISHED`, voir `installation-service.ts`).
 *
 * Rôle de ce fichier : documenter la forme que prendra chaque agent métier
 * futur — son domaine (`AgentDefinition.category`), les outils et
 * permissions qu'il déclarera vraisemblablement, et la forme de tâche
 * qu'il traitera — pour qu'implémenter un de ces agents plus tard consiste
 * à écrire un `AgentRuntime` (voir `definitions/diagnostic-agent.ts` ou
 * `definitions/director-agent.ts` comme modèles) et l'enregistrer via
 * `registerAgentRuntime`, sans jamais devoir retoucher le Framework ni le
 * Director. Voir ADR 0012.
 */

export type FutureAgentContract = {
  /** Doit correspondre à `AgentDefinition.category` — c'est ce que le Director utilise pour résoudre une délégation par `targetCategory`. */
  readonly category: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  /** Outils que cet agent déclarera une fois implémenté — les clés doivent exister au registre d'outils (`AgentTool`), même en tant que stub `notYetImplemented`. */
  readonly plannedToolKeys: string[];
  readonly plannedPermissions: string[];
  /** Forme illustrative de tâche que le `AgentRuntime` réel traitera en fonction de `context.input` — documentation, pas un type imposé au moteur. */
  readonly exampleTaskShape: string;
};

export interface CrmAgentTask {
  action: "update_lead_stage" | "enrich_contact" | "merge_duplicates" | "score_lead";
  [key: string]: unknown;
}

export interface MarketingAgentTask {
  action: "draft_campaign" | "segment_audience" | "analyze_performance";
  [key: string]: unknown;
}

export interface SupportAgentTask {
  action: "answer_ticket" | "escalate_ticket" | "summarize_conversation";
  [key: string]: unknown;
}

export interface AnalyseAgentTask {
  action: "generate_report" | "detect_anomaly" | "forecast_metric";
  [key: string]: unknown;
}

export interface FinanceAgentTask {
  action: "reconcile_invoice" | "flag_overdue" | "generate_statement";
  [key: string]: unknown;
}

export interface DeveloppementAgentTask {
  action: "review_pull_request" | "triage_bug" | "generate_migration";
  [key: string]: unknown;
}

/**
 * Catalogue des agents métier futurs — utilisé uniquement pour générer les
 * `AgentDefinition` de statut `DRAFT` (visibles dans l'admin comme
 * "roadmap", jamais installables) via `bootstrap.ts#syncAgentCatalog`.
 * Ajouter un futur domaine = ajouter une entrée ici, jamais modifier le
 * Framework ou le Director.
 *
 * L'agent Commercial (catégorie "commercial") a quitté cette liste en
 * v0.5 : il est désormais réellement implémenté (voir
 * `definitions/commercial-agent.ts`) — sa définition est passée de
 * `DRAFT` à `PUBLISHED` par `bootstrap.ts#promoteGlobalAgentDefinition`,
 * même mécanisme que celui prévu par l'ADR 0012 pour chaque futur agent.
 */
export const FUTURE_AGENT_CONTRACTS: FutureAgentContract[] = [
  {
    category: "crm",
    key: "future-crm-agent",
    name: "Agent CRM (à venir)",
    description: "Mise à jour du pipeline, enrichissement de contacts, déduplication — non implémenté.",
    icon: "📇",
    plannedToolKeys: ["database.query", "crm.leads_count_by_stage"],
    plannedPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    exampleTaskShape: "CrmAgentTask",
  },
  {
    category: "marketing",
    key: "future-marketing-agent",
    name: "Agent Marketing (à venir)",
    description: "Rédaction de campagnes, segmentation d'audience, analyse de performance — non implémenté.",
    icon: "📣",
    plannedToolKeys: ["email.send", "search.web"],
    plannedPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    exampleTaskShape: "MarketingAgentTask",
  },
  {
    category: "support",
    key: "future-support-agent",
    name: "Agent Support (à venir)",
    description: "Réponse aux tickets, escalade, résumé de conversation — non implémenté.",
    icon: "🎧",
    plannedToolKeys: ["email.send", "files.read"],
    plannedPermissions: ["VIEW_WORKSPACE"],
    exampleTaskShape: "SupportAgentTask",
  },
  {
    category: "analyse",
    key: "future-analyse-agent",
    name: "Agent Analyse (à venir)",
    description: "Rapports, détection d'anomalies, prévisions — non implémenté.",
    icon: "📊",
    plannedToolKeys: ["database.query", "crm.leads_count_by_stage", "pdf.generate"],
    plannedPermissions: ["VIEW_WORKSPACE"],
    exampleTaskShape: "AnalyseAgentTask",
  },
  {
    category: "finance",
    key: "future-finance-agent",
    name: "Agent Finance (à venir)",
    description: "Rapprochement de factures, relances d'impayés, relevés — non implémenté.",
    icon: "💰",
    plannedToolKeys: ["database.query", "pdf.generate", "email.send"],
    plannedPermissions: ["MANAGE_FINANCE", "VIEW_WORKSPACE"],
    exampleTaskShape: "FinanceAgentTask",
  },
  {
    category: "developpement",
    key: "future-developpement-agent",
    name: "Agent Développement (à venir)",
    description: "Revue de pull requests, triage de bugs, génération de migrations — non implémenté.",
    icon: "🛠️",
    plannedToolKeys: ["api.call_external", "files.read"],
    plannedPermissions: ["VIEW_WORKSPACE"],
    exampleTaskShape: "DeveloppementAgentTask",
  },
];
