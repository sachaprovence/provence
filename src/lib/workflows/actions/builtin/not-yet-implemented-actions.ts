import "server-only";
import type { WorkflowActionHandler } from "../registry";

/**
 * Actions déclarées au registre (visibles dans la palette de l'éditeur,
 * assignables dans un workflow) mais dont l'implémentation réelle est hors
 * périmètre de cette phase — même principe honnête que
 * `agents/tools/placeholder-tools.ts` (v0.3) : plutôt que de simuler un
 * faux succès ou d'écrire en dur une logique métier qui court-circuiterait
 * les routes existantes (aucune de ces opérations n'a de couche de service
 * réutilisable aujourd'hui — `Task`/`Quote`/`Appointment`/`Customer` sont
 * mutés directement dans les routes API de Provence 360, voir ADR 0022),
 * chaque appel échoue explicitement. Remplacer un stub par une vraie
 * implémentation ne change ni sa clé ni son usage par un workflow existant.
 */
function notYetImplemented(key: string, name: string, description: string, category: string): WorkflowActionHandler {
  return {
    key,
    name,
    description,
    category,
    async execute() {
      throw new Error(`L'action "${key}" est déclarée au registre mais son implémentation n'est pas encore développée.`);
    },
  };
}

export const notYetImplementedActions: WorkflowActionHandler[] = [
  notYetImplemented("sms.send", "Envoyer un SMS", "Aucun fournisseur SMS n'est encore intégré à Autorun.", "communication"),
  notYetImplemented("file.write", "Créer un fichier", "Aucun système de stockage de fichiers n'est encore intégré à Autorun.", "documents"),
  notYetImplemented(
    "document.generate",
    "Créer un document",
    "Génération de document — nécessite un moteur de documents dédié, pas encore implémenté.",
    "documents"
  ),
  notYetImplemented(
    "customer.update",
    "Modifier un client",
    "Nécessite d'abord d'extraire la logique de mise à jour client de Provence 360 en un service réutilisable.",
    "provence360"
  ),
  notYetImplemented(
    "task.create",
    "Créer une tâche",
    "Nécessite d'abord d'extraire la logique de création de tâche de Provence 360 en un service réutilisable.",
    "provence360"
  ),
  notYetImplemented(
    "quote.create",
    "Créer un devis",
    "Nécessite d'abord d'extraire la logique de création de devis de Provence 360 en un service réutilisable.",
    "provence360"
  ),
  notYetImplemented(
    "invoice.create",
    "Créer une facture",
    "La facturation n'existe pas encore dans Provence 360 (voir BACKLOG).",
    "provence360"
  ),
  notYetImplemented(
    "appointment.create",
    "Créer un rendez-vous",
    "Nécessite d'abord d'extraire la logique de création de rendez-vous de Provence 360 en un service réutilisable.",
    "provence360"
  ),
];
