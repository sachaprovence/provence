import "server-only";
import { prisma } from "@/lib/prisma";
import type { WorkflowGraph, Rule } from "../graph-types";

/**
 * Modèles prêts à l'emploi (voir brief v0.6) — `WorkflowDefinition` globaux
 * (`organizationId`/`workspaceId` nuls, `isTemplate: true`), jamais
 * activables directement (même convention que les `AgentDefinition`
 * globaux) : un utilisateur les clone d'abord dans son workspace via
 * `workflow-service.ts#cloneWorkflowDefinition`. Chaque graphe est
 * volontairement simple (2 à 5 noeuds) — le but est de démontrer le
 * schéma et d'amorcer une personnalisation, pas de livrer une automatisation
 * clé en main pour chaque cas d'usage.
 */

/** `y`/`x` sont des indices de ligne/colonne, convertis en pixels — jamais des coordonnées brutes (sous peine de superposer tous les noeuds, voir le graphe canvas). */
const ROW_HEIGHT = 130;
const COL_WIDTH = 220;
function pos(row: number, col = 0) {
  return { x: col * COL_WIDTH, y: row * ROW_HEIGHT };
}

function trigger(id: string, triggerKey: string, config?: Record<string, unknown>) {
  return { id, type: "trigger" as const, position: pos(0), data: { triggerKey, config } };
}
function end(id: string, row: number) {
  return { id, type: "end" as const, position: pos(row), data: {} };
}
function action(id: string, row: number, actionKey: string, input?: Record<string, unknown>, col = 0) {
  return { id, type: "action" as const, position: pos(row, col), data: { actionKey, input } };
}
function wait(id: string, row: number, delayMs: number) {
  return { id, type: "wait" as const, position: pos(row), data: { delayMs } };
}
function condition(id: string, row: number, rule: Rule) {
  return { id, type: "condition" as const, position: pos(row), data: { rule } };
}
function edge(id: string, source: string, target: string, branch?: string) {
  return { id, source, target, branch };
}

const TEMPLATES: { key: string; name: string; description: string; category: string; graph: WorkflowGraph }[] = [
  {
    key: "template-prospection",
    name: "Prospection",
    description: "Nouveau prospect → cycle complet de l'Agent Commercial (qualification, score, email).",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "prospect.created"),
        action("call", 1, "agent.call", { category: "commercial", input: { action: "full_cycle" } }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "call"), edge("e2", "call", "end1")],
    },
  },
  {
    key: "template-relance",
    name: "Relance",
    description: "Planification récurrente → l'Agent Commercial prépare une relance.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "schedule.cron", { cronExpression: "0 9 * * *" }),
        action("call", 1, "agent.call", { category: "commercial", input: { action: "draft_followup" } }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "call"), edge("e2", "call", "end1")],
    },
  },
  {
    key: "template-suivi-client",
    name: "Suivi client",
    description: "Rendez-vous créé → notifier l'équipe pour préparer le suivi.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "appointment.created"),
        action("notify", 1, "notification.create", { type: "workflow", title: "Rendez-vous à préparer" }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  {
    key: "template-creation-devis",
    name: "Création devis",
    description: "Action commerciale approuvée → préparer un devis (nécessite l'action \"quote.create\", non encore implémentée).",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "commercial.action.approved"),
        action("quote", 1, "quote.create", {}),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "quote"), edge("e2", "quote", "end1")],
    },
  },
  {
    key: "template-signature",
    name: "Signature",
    description: "Devis signé → notifier et proposer les prochaines actions commerciales.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "quote.signed"),
        action("notify", 1, "notification.create", { type: "workflow", title: "Devis signé !" }, 0),
        action("recommend", 1, "agent.call", { category: "commercial", input: { action: "recommend_next_actions" } }, 1),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e1b", "t1", "recommend"), edge("e2", "notify", "end1"), edge("e2b", "recommend", "end1")],
    },
  },
  {
    key: "template-facturation",
    name: "Facturation",
    description: "Paiement reçu → générer une facture (nécessite l'action \"invoice.create\", non encore implémentée).",
    category: "finance",
    graph: {
      nodes: [trigger("t1", "payment.received"), action("invoice", 1, "invoice.create", {}), end("end1", 2)],
      edges: [edge("e1", "t1", "invoice"), edge("e2", "invoice", "end1")],
    },
  },
  {
    key: "template-support",
    name: "Support",
    description: "Email reçu → si le sujet contient \"urgent\", notifier immédiatement, sinon créer une tâche de suivi.",
    category: "support",
    graph: {
      nodes: [
        trigger("t1", "email.received"),
        condition("cond", 1, { op: "regex", value: { kind: "var", path: "context.subject" }, pattern: "urgent", flags: "i" }),
        action("urgent", 2, "notification.create", { type: "workflow", title: "Email urgent reçu" }, 0),
        action("task", 2, "task.create", {}, 1),
        end("end1", 3),
      ],
      edges: [
        edge("e1", "t1", "cond"),
        edge("e2", "cond", "urgent", "true"),
        edge("e3", "cond", "task", "false"),
        edge("e4", "urgent", "end1"),
        edge("e5", "task", "end1"),
      ],
    },
  },
  {
    key: "template-onboarding-client",
    name: "Onboarding client",
    description: "Client créé → email de bienvenue, puis rappel après un délai.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "customer.created"),
        action("welcome", 1, "email.send", {
          fromName: "{{ organization.name }}",
          fromEmail: "contact@example.com",
          toEmail: "{{ context.email }}",
          subject: "Bienvenue !",
          body: "Merci de votre confiance.",
        }),
        wait("wait1", 2, 3 * 24 * 60 * 60 * 1000),
        action("reminder", 3, "notification.create", { type: "workflow", title: "Vérifier l'onboarding du nouveau client" }),
        end("end1", 4),
      ],
      edges: [edge("e1", "t1", "welcome"), edge("e2", "welcome", "wait1"), edge("e3", "wait1", "reminder"), edge("e4", "reminder", "end1")],
    },
  },
  {
    key: "template-suivi-visite-virtuelle",
    name: "Suivi visite virtuelle",
    description: "Rendez-vous de prise de vue effectué → délai puis email de suivi (avis, livrables).",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "appointment.created"),
        wait("wait1", 1, 24 * 60 * 60 * 1000),
        action("followup", 2, "email.send", {
          fromName: "{{ organization.name }}",
          fromEmail: "contact@example.com",
          toEmail: "{{ context.contactEmail }}",
          subject: "Votre visite virtuelle est en ligne",
          body: "Voici le lien vers votre visite virtuelle 360°.",
        }),
        end("end1", 3),
      ],
      edges: [edge("e1", "t1", "wait1"), edge("e2", "wait1", "followup"), edge("e3", "followup", "end1")],
    },
  },
  {
    key: "template-relance-paiement",
    name: "Relance paiement",
    description: "Planification récurrente → si une facture est en retard (variable de contexte), notifier.",
    category: "finance",
    graph: {
      nodes: [
        trigger("t1", "schedule.cron", { cronExpression: "0 8 * * *" }),
        condition("cond", 1, { op: "eq", left: { kind: "var", path: "context.overdue" }, right: { kind: "literal", value: true } }),
        action("notify", 2, "notification.create", { type: "workflow", title: "Facture en retard de paiement" }, 0),
        action("skip", 2, "notification.create", { type: "workflow", title: "Aucune facture en retard" }, 1),
        end("end1", 3),
      ],
      edges: [
        edge("e1", "t1", "cond"),
        edge("e2", "cond", "notify", "true"),
        edge("e3", "cond", "skip", "false"),
        edge("e4", "notify", "end1"),
        edge("e5", "skip", "end1"),
      ],
    },
  },
];

/** Idempotent : recherche par `key` (workspaceId nul), crée si absent — ne modifie jamais un template déjà seedé (l'utilisateur a pu le cloner et le personnaliser). */
export async function ensureWorkflowTemplates(): Promise<void> {
  for (const template of TEMPLATES) {
    const existing = await prisma.workflowDefinition.findFirst({ where: { key: template.key, isTemplate: true, workspaceId: null } });
    if (existing) continue;

    const definition = await prisma.workflowDefinition.create({
      data: {
        organizationId: null,
        workspaceId: null,
        key: template.key,
        name: template.name,
        description: template.description,
        category: template.category,
        status: "ACTIVE",
        isTemplate: true,
      },
    });
    const version = await prisma.workflowVersion.create({
      data: { workflowDefinitionId: definition.id, version: 1, graph: template.graph as never },
    });
    await prisma.workflowDefinition.update({ where: { id: definition.id }, data: { activeVersionId: version.id } });
  }
}

export const WORKFLOW_TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
