import "server-only";
import type { AutomationJobHandler } from "../registry";

/**
 * Jobs déclarés au registre (visibles, assignables à un noeud "action")
 * mais dont l'implémentation réelle est hors périmètre de cette phase —
 * même principe honnête que `workflows/actions/builtin/not-yet-implemented-actions.ts`
 * (v0.6, ADR 0022) : aucune de ces opérations n'a de couche de service
 * réutilisable aujourd'hui sans risquer de dupliquer ou de contourner la
 * logique déjà présente dans les routes existantes de Provence 360.
 */
function notYetImplemented(key: string, name: string, description: string, category: string): AutomationJobHandler {
  return {
    key,
    name,
    description,
    category,
    async execute() {
      throw new Error(`Le job "${key}" est déclaré au registre mais son implémentation n'est pas encore développée.`);
    },
  };
}

export const notYetImplementedActions: AutomationJobHandler[] = [
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
    "quote.create",
    "Créer un devis",
    "Nécessite d'abord d'extraire la logique de création de devis de Provence 360 en un service réutilisable.",
    "provence360"
  ),
  notYetImplemented("invoice.create", "Créer une facture", "La facturation n'existe pas encore dans Provence 360 (voir BACKLOG).", "provence360"),
  notYetImplemented(
    "appointment.create",
    "Créer un rendez-vous",
    "Nécessite d'abord d'extraire la logique de création de rendez-vous de Provence 360 en un service réutilisable.",
    "provence360"
  ),
];
