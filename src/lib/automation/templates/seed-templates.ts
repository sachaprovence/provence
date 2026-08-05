import "server-only";
import { prisma } from "@/lib/prisma";
import type { AutomationGraph } from "../graph-types";

/**
 * Automatisations métier prêtes à l'emploi (brief v0.9, task #91) : les 10
 * automatisations nommément demandées — Nouveau prospect, Demande de devis,
 * Rendez-vous confirmé, Visite terminée, Facture envoyée, Paiement reçu,
 * Client inactif, Demande d'avis Google, Relance automatique, Publication
 * réseaux sociaux. Mêmes principes que `workflows/templates/seed-templates.ts`
 * (v0.6) : `Automation` globaux (`organizationId`/`workspaceId` nuls,
 * `isTemplate: true`), jamais activables directement — un utilisateur les
 * clone d'abord dans son workspace (`registry/automation-service.ts#cloneAutomationDefinition`).
 *
 * Différence assumée avec les templates v0.6 : CHAQUE déclencheur et CHAQUE
 * action référencés ici sont RÉELLEMENT câblés/exécutables dès aujourd'hui
 * (agents métier v0.9 opérant sur les vraies données CRM, `email.send`/
 * `notification.create` réels, évènements `quote.*`/`invoice.*`/
 * `virtual_tour.*`/`appointment.created` réellement publiés — voir
 * `trigger-engine.ts#REAL_EMISSION_EVENT_KEYS`, étendu par ce même task) :
 * contrairement à certains templates v0.6 (ex. "quote.create" non
 * implémentée à l'époque), aucun n'est un exemple aspirationnel.
 */

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
function action(id: string, row: number, jobType: string, input?: Record<string, unknown>, col = 0) {
  return { id, type: "action" as const, position: pos(row, col), data: { jobType, input } };
}
function wait(id: string, row: number, delayMs: number) {
  return { id, type: "wait" as const, position: pos(row), data: { delayMs } };
}
function edge(id: string, source: string, target: string, branch?: string) {
  return { id, source, target, branch };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const TEMPLATES: { key: string; name: string; description: string; category: string; graph: AutomationGraph }[] = [
  {
    key: "template-nouveau-prospect",
    name: "Nouveau prospect",
    description: "Nouveau prospect créé → l'Agent Prospection rédige un premier message de prise de contact (jamais envoyé automatiquement).",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "lead.created"),
        action("outreach", 1, "agent.call", { category: "prospection", input: { action: "draft_outreach", leadId: "{{ context.leadId }}" } }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "outreach"), edge("e2", "outreach", "end1")],
    },
  },
  {
    key: "template-demande-devis",
    name: "Demande de devis",
    description: "Devis envoyé → notifier l'équipe puis, sans réponse après 3 jours, l'Agent Relance prépare une relance.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "quote.sent"),
        action("notify", 1, "notification.create", { title: "Devis envoyé — en attente de retour", link: "/leads/{{ context.leadId }}" }),
        wait("wait1", 2, 3 * DAY_MS),
        action("followup", 3, "agent.call", { category: "relance", input: { action: "draft_followup", leadId: "{{ context.leadId }}" } }),
        end("end1", 4),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "wait1"), edge("e3", "wait1", "followup"), edge("e4", "followup", "end1")],
    },
  },
  {
    key: "template-rendez-vous-confirme",
    name: "Rendez-vous confirmé",
    description: "Rendez-vous créé → notifier l'équipe pour préparer la prise de vue.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "appointment.created"),
        action("notify", 1, "notification.create", { title: "Rendez-vous confirmé — à préparer", link: "/leads/{{ context.leadId }}" }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  {
    key: "template-visite-terminee",
    name: "Visite terminée",
    description: "Prise de vue terminée → délai de traitement puis rappel à l'équipe de publier la visite 3D.",
    category: "production",
    graph: {
      nodes: [
        trigger("t1", "virtual_tour.shooting_done"),
        wait("wait1", 1, 1 * DAY_MS),
        action("notify", 2, "notification.create", { title: "Visite 3D à publier", link: "/visits" }),
        end("end1", 3),
      ],
      edges: [edge("e1", "t1", "wait1"), edge("e2", "wait1", "notify"), edge("e3", "notify", "end1")],
    },
  },
  {
    key: "template-facturation-envoyee",
    name: "Facture envoyée",
    description: "Facture envoyée → notifier l'équipe finance.",
    category: "finance",
    graph: {
      nodes: [
        trigger("t1", "invoice.sent"),
        action("notify", 1, "notification.create", { title: "Facture envoyée", link: "/invoices" }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  {
    key: "template-paiement-recu",
    name: "Paiement reçu",
    description: "Paiement reçu → notifier l'équipe finance.",
    category: "finance",
    graph: {
      nodes: [
        trigger("t1", "invoice.paid"),
        action("notify", 1, "notification.create", { title: "Paiement reçu — merci !", link: "/invoices" }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  {
    key: "template-client-inactif",
    name: "Client inactif",
    description: "Chaque semaine → l'Agent Analyse détecte les prospects bloqués depuis longtemps dans le pipeline et notifie l'équipe.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "schedule.cron", { cronExpression: "0 8 * * 1" }),
        action("detect", 1, "agent.call", { category: "analyse", input: { action: "detect_stalled_leads", staleAfterDays: 30 } }),
        action("notify", 2, "notification.create", { title: "Analyse des prospects inactifs disponible", link: "/dashboards" }),
        end("end1", 3),
      ],
      edges: [edge("e1", "t1", "detect"), edge("e2", "detect", "notify"), edge("e3", "notify", "end1")],
    },
  },
  {
    key: "template-demande-avis-google",
    name: "Demande d'avis Google",
    description:
      "Visite 3D publiée → délai puis rappel à l'équipe de demander un avis Google au client (aucune API Google Reviews connectée dans cet environnement — demande manuelle honnête).",
    category: "marketing",
    graph: {
      nodes: [
        trigger("t1", "virtual_tour.published"),
        wait("wait1", 1, 2 * DAY_MS),
        action("notify", 2, "notification.create", {
          title: "Demander un avis Google au client",
          body: "Aucune intégration Google Reviews n'est connectée — demande à effectuer manuellement.",
          link: "/leads/{{ context.leadId }}",
        }),
        end("end1", 3),
      ],
      edges: [edge("e1", "t1", "wait1"), edge("e2", "wait1", "notify"), edge("e3", "notify", "end1")],
    },
  },
  {
    key: "template-relance-automatique",
    name: "Relance automatique",
    description: "Chaque matin → l'Agent Relance identifie les prospects restés sans réponse en dehors de toute séquence programmée.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "schedule.cron", { cronExpression: "0 9 * * *" }),
        action("find", 1, "agent.call", { category: "relance", input: { action: "find_stale_leads" } }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "find"), edge("e2", "find", "end1")],
    },
  },
  {
    key: "template-publication-reseaux-sociaux",
    name: "Publication réseaux sociaux",
    description: "Visite 3D publiée → l'Agent Réseaux sociaux rédige une publication prête à copier-coller.",
    category: "marketing",
    graph: {
      nodes: [
        trigger("t1", "virtual_tour.published"),
        action("draft", 1, "agent.call", { category: "social", input: { action: "draft_post", virtualTourId: "{{ context.virtualTourId }}" } }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "draft"), edge("e2", "draft", "end1")],
    },
  },
  {
    // v1.1, AR-0175 — 11ᵉ modèle : "livraison" n'avait pas d'évènement dédié
    // (le plus proche, `invoice.sent`, n'est pas une livraison). Déclenché
    // par `virtual_tour.delivered` (AR-0167), distinct de `virtual_tour.published`.
    key: "template-livraison-effectuee",
    name: "Livraison effectuée",
    description: "Visite 3D livrée au client → notifier l'équipe et suggérer une demande d'avis Google (aucun envoi automatique).",
    category: "production",
    graph: {
      nodes: [
        trigger("t1", "virtual_tour.delivered"),
        action("notify", 1, "notification.create", {
          title: "Visite 3D livrée au client",
          body: "Livraison confirmée — pensez à demander un avis Google au client.",
          link: "/visits/{{ context.virtualTourId }}",
        }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  // v1.4, AR-0181 — 4 modèles nommément demandés pour la première mise à
  // disposition client (qualification, résumé quotidien, prospect
  // prioritaire, tâche de suivi) : mêmes principes que les 11 modèles
  // ci-dessus, chaque déclencheur/action est réellement câblé dès
  // aujourd'hui (voir `task-actions.ts`, `report-actions.ts`,
  // `lead.became_priority` dans `builtin-triggers.ts`/`trigger-engine.ts`).
  {
    key: "template-qualification-demande-entrante",
    name: "Qualification de demandes entrantes",
    description: "Nouveau prospect créé → l'Agent Analyse qualifie la demande, puis une tâche de suivi est créée pour le commercial assigné.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "lead.created"),
        action("qualify", 1, "agent.call", { category: "analyse", input: { action: "detect_stalled_leads", staleAfterDays: 0 } }),
        action("task", 2, "task.create", {
          title: "Qualifier ce nouveau prospect",
          leadId: "{{ context.leadId }}",
          dueInDays: 1,
        }),
        end("end1", 3),
      ],
      edges: [edge("e1", "t1", "qualify"), edge("e2", "qualify", "task"), edge("e3", "task", "end1")],
    },
  },
  {
    key: "template-resume-quotidien",
    name: "Résumé quotidien de l'activité",
    description: "Chaque matin → diffuse un résumé de l'activité des dernières 24h (nouveaux prospects, messages, rendez-vous, automatisations).",
    category: "reporting",
    graph: {
      nodes: [
        trigger("t1", "schedule.cron", { cronExpression: "0 7 * * *" }),
        action("summary", 1, "report.daily_summary", {}),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "summary"), edge("e2", "summary", "end1")],
    },
  },
  {
    key: "template-prospect-prioritaire",
    name: "Prospect devenu prioritaire",
    description: "Le score d'un prospect franchit le seuil de priorité → notifier l'équipe immédiatement.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "lead.became_priority"),
        action("notify", 1, "notification.create", {
          title: "Prospect prioritaire à traiter",
          body: "Ce prospect vient de franchir le seuil de priorité — un traitement rapide est recommandé.",
          link: "/leads/{{ context.leadId }}",
        }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "notify"), edge("e2", "notify", "end1")],
    },
  },
  {
    key: "template-tache-de-suivi",
    name: "Création automatique d'une tâche de suivi",
    description: "Rendez-vous confirmé → crée automatiquement une tâche de préparation pour l'équipe, avec échéance à J-1.",
    category: "commercial",
    graph: {
      nodes: [
        trigger("t1", "appointment.created"),
        action("task", 1, "task.create", {
          title: "Préparer le rendez-vous",
          leadId: "{{ context.leadId }}",
          dueInDays: 1,
        }),
        end("end1", 2),
      ],
      edges: [edge("e1", "t1", "task"), edge("e2", "task", "end1")],
    },
  },
];

/** Idempotent : recherche par `key` (workspaceId nul), crée si absent — ne modifie jamais un template déjà seedé (l'utilisateur a pu le cloner et le personnaliser). */
export async function ensureAutomationTemplates(): Promise<void> {
  for (const template of TEMPLATES) {
    const existing = await prisma.automation.findFirst({ where: { key: template.key, isTemplate: true, workspaceId: null } });
    if (existing) continue;

    const definition = await prisma.automation.create({
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
    const version = await prisma.automationVersion.create({
      data: { automationId: definition.id, version: 1, graph: template.graph as never },
    });
    await prisma.automation.update({ where: { id: definition.id }, data: { activeVersionId: version.id } });
  }
}

export const AUTOMATION_TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
