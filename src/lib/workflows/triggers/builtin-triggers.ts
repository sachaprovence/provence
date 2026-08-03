import "server-only";
import { registerTriggerType } from "./registry";

/**
 * Déclencheurs fournis d'origine (voir brief v0.6). Chaque entrée est de la
 * pure documentation pour la palette de l'éditeur — le déclenchement réel
 * passe toujours par `triggerWorkflowsForEvent` (évènements applicatifs),
 * `processDueWorkflowCronTriggers`/`processDueWorkflowSchedules`
 * (planification), l'API manuelle, ou la route webhook générique (voir
 * `trigger-engine.ts`).
 */
const BUILT_IN_TRIGGER_TYPES = [
  { key: "prospect.created", name: "Nouveau prospect", description: "Un CommercialProspect vient d'être créé.", category: "commercial", kind: "event" },
  { key: "customer.created", name: "Client créé", description: "Un client (Customer) vient d'être créé.", category: "commercial", kind: "event" },
  { key: "email.received", name: "Email reçu", description: "Une réponse entrante a été reçue.", category: "communication", kind: "event" },
  { key: "quote.signed", name: "Devis signé", description: "Un devis vient de passer au statut signé.", category: "commercial", kind: "event" },
  { key: "payment.received", name: "Paiement reçu", description: "Un paiement a été confirmé.", category: "finance", kind: "event" },
  { key: "appointment.created", name: "Rendez-vous créé", description: "Un rendez-vous vient d'être planifié.", category: "commercial", kind: "event" },
  { key: "schedule.time", name: "Heure planifiée", description: "Déclenchement ponctuel à une date/heure donnée.", category: "planification", kind: "schedule" },
  { key: "schedule.cron", name: "Cron", description: "Déclenchement récurrent selon une expression cron (5 champs).", category: "planification", kind: "schedule" },
  { key: "webhook.received", name: "Webhook", description: "Appel HTTP entrant sur l'URL webhook dédiée du workflow.", category: "intégration", kind: "webhook" },
  { key: "user.action", name: "Action utilisateur", description: "Déclenchement manuel depuis l'interface ou l'API.", category: "manuel", kind: "manual" },
  { key: "workflow.completed", name: "Fin d'un autre workflow", description: "Un autre workflow (par clé) vient de se terminer.", category: "orchestration", kind: "event" },
  { key: "agent.run.completed", name: "Exécution d'un agent", description: "Une exécution d'agent (AgentRun) vient de se terminer.", category: "orchestration", kind: "event" },
  { key: "commercial.action.approved", name: "Action commerciale approuvée", description: "Une CommercialAction vient d'être approuvée.", category: "commercial", kind: "event" },
  { key: "commercial.action.sent", name: "Action commerciale envoyée", description: "Une CommercialAction vient d'être envoyée.", category: "commercial", kind: "event" },
] as const;

export function registerBuiltInTriggerTypes(): void {
  for (const definition of BUILT_IN_TRIGGER_TYPES) registerTriggerType(definition);
}
