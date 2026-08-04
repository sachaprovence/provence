import "server-only";
import { registerAutomationTriggerType } from "./registry";

/**
 * Catalogue des 25 déclencheurs demandés par le brief v0.8. Chaque entrée
 * est une description pour la palette — le déclenchement réel passe par
 * `fireAutomationEvent` (évènements), `processDueAutomationSchedules`
 * (planification), `fireAutomationWebhook`, ou l'API manuelle (voir
 * `trigger-engine.ts`). Certains évènements sont déjà câblés à un point
 * d'émission réel de la plateforme (voir la tâche "Wire real trigger
 * emission points", ADR 0037) ; les autres sont déclarés et immédiatement
 * utilisables via l'API générique, mais pas encore déclenchés
 * automatiquement par une route Provence 360 — même honnêteté que les
 * déclencheurs `prospect.created`/`payment.received`... du Workflow
 * Engine (v0.6), qui ne le sont pas non plus aujourd'hui.
 */
const BUILT_IN_AUTOMATION_TRIGGER_TYPES = [
  { key: "schedule.cron", name: "Cron", description: "Expression cron (avec plages/alias), fuseau horaire, jours ouvrés, blackout, fenêtres d'exécution.", category: "planification", kind: "schedule" },
  { key: "schedule.date", name: "Date", description: "Déclenchement ponctuel à une date précise.", category: "planification", kind: "schedule" },
  { key: "schedule.time", name: "Heure", description: "Déclenchement quotidien à une heure précise (raccourci d'un cron).", category: "planification", kind: "schedule" },
  { key: "schedule.interval", name: "Intervalle", description: "Déclenchement répété toutes les N minutes/heures.", category: "planification", kind: "schedule" },
  { key: "webhook.received", name: "Webhook", description: "Appel HTTP entrant sur l'URL webhook dédiée de l'automatisation.", category: "intégration", kind: "webhook" },
  { key: "api.manual", name: "API", description: "Déclenchement via un appel direct à l'API REST de l'Automation Engine.", category: "intégration", kind: "api" },
  { key: "event.custom", name: "Event Bus", description: "Abonnement à une clé d'évènement applicatif arbitraire du bus d'évènements.", category: "orchestration", kind: "event" },
  { key: "workflow.completed", name: "Workflow terminé", description: "Un workflow (Workflow Engine, v0.6) vient de se terminer.", category: "orchestration", kind: "event" },
  { key: "agent.run.completed", name: "Agent terminé", description: "Une exécution d'agent (AgentRun) vient de se terminer.", category: "orchestration", kind: "event" },
  { key: "email.received", name: "Email reçu", description: "Une réponse entrante a été reçue.", category: "communication", kind: "event" },
  { key: "lead.created", name: "Lead créé", description: "Un prospect (Lead) vient d'être créé.", category: "crm", kind: "event" },
  { key: "lead.updated", name: "Lead modifié", description: "Un prospect (Lead) vient d'être modifié.", category: "crm", kind: "event" },
  // v1.1, AR-0165 — granulaire (contrairement à `lead.updated`, générique) : payload `{leadId, previousStage, newStage}`,
  // permet de s'abonner à UNE transition précise (ex. condition `{{event.newStage}} == "WON"`) sans revérifier l'état.
  { key: "lead.stage_changed", name: "Étape du pipeline changée", description: "Un prospect vient de changer d'étape dans le pipeline commercial (payload : leadId, previousStage, newStage).", category: "crm", kind: "event" },
  { key: "lead.deleted", name: "Lead supprimé", description: "Un prospect (Lead) vient d'être supprimé.", category: "crm", kind: "event" },
  { key: "customer.created", name: "Client créé", description: "Un client (Customer) vient d'être créé.", category: "crm", kind: "event" },
  { key: "payment.received", name: "Paiement reçu", description: "Un paiement a été confirmé.", category: "finance", kind: "event" },
  { key: "document.signed", name: "Document signé", description: "Un document (ex. devis) vient de passer au statut signé.", category: "commercial", kind: "event" },
  { key: "user.logged_in", name: "Utilisateur connecté", description: "Un utilisateur vient de se connecter.", category: "sécurité", kind: "event" },
  { key: "user.registered", name: "Utilisateur créé", description: "Un nouvel utilisateur vient d'être créé.", category: "sécurité", kind: "event" },
  { key: "organization.created", name: "Organisation créée", description: "Une nouvelle organisation vient d'être créée.", category: "plateforme", kind: "event" },
  { key: "workspace.created", name: "Workspace créé", description: "Un nouveau workspace vient d'être créé.", category: "plateforme", kind: "event" },
  { key: "import.completed", name: "Import terminé", description: "Un import (ex. CSV de prospects) vient de se terminer.", category: "données", kind: "event" },
  { key: "export.completed", name: "Export terminé", description: "Un export de données vient de se terminer.", category: "données", kind: "event" },
  { key: "error.detected", name: "Erreur détectée", description: "Une erreur applicative significative vient d'être détectée.", category: "observabilité", kind: "event" },
  { key: "webhook.external", name: "Webhook externe", description: "Rappel HTTP entrant d'un service tiers (ex. paiement, signature électronique).", category: "intégration", kind: "webhook" },
  { key: "manual.user_action", name: "Déclencheur manuel", description: "Déclenchement manuel depuis l'interface ou l'API.", category: "manuel", kind: "manual" },
  { key: "custom", name: "Déclencheur personnalisé", description: "Clé d'évènement libre, pour tout besoin non couvert par le catalogue.", category: "extensibilité", kind: "event" },
  // Évènements métier Provence 360 (v0.9, task #91) — RÉELLEMENT câblés, voir `trigger-engine.ts#REAL_EMISSION_EVENT_KEYS` (ADR 0037).
  { key: "appointment.created", name: "Rendez-vous confirmé", description: "Un rendez-vous vient d'être créé.", category: "crm", kind: "event" },
  { key: "quote.sent", name: "Devis envoyé", description: "Un devis vient d'être envoyé à un prospect/client.", category: "commercial", kind: "event" },
  { key: "quote.signed", name: "Devis signé", description: "Un devis vient d'être signé.", category: "commercial", kind: "event" },
  { key: "quote.signature_declined", name: "Signature de devis refusée", description: "Une demande de signature de devis vient d'être refusée.", category: "commercial", kind: "event" },
  { key: "invoice.created", name: "Facture créée", description: "Une facture vient d'être créée à partir d'un devis accepté.", category: "finance", kind: "event" },
  { key: "invoice.sent", name: "Facture envoyée", description: "Une facture vient d'être envoyée.", category: "finance", kind: "event" },
  { key: "invoice.paid", name: "Paiement reçu", description: "Une facture vient d'être marquée payée.", category: "finance", kind: "event" },
  { key: "virtual_tour.created", name: "Visite 3D créée", description: "Une visite 3D vient d'être créée.", category: "production", kind: "event" },
  { key: "virtual_tour.shooting_done", name: "Visite terminée", description: "La prise de vue d'une visite 3D vient d'être marquée terminée.", category: "production", kind: "event" },
  { key: "virtual_tour.published", name: "Visite 3D publiée", description: "Une visite 3D vient d'être publiée.", category: "production", kind: "event" },
  { key: "property.created", name: "Bien immobilier créé", description: "Un bien immobilier vient d'être créé.", category: "crm", kind: "event" },
] as const;

export function registerBuiltInAutomationTriggerTypes(): void {
  for (const definition of BUILT_IN_AUTOMATION_TRIGGER_TYPES) registerAutomationTriggerType(definition);
}
