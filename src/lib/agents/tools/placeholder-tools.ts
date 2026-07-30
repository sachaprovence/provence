import "server-only";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclarés au registre (catégories demandées : base de données,
 * email, calendrier, documents, API, recherche, fichiers, génération PDF)
 * mais dont l'implémentation réelle est hors périmètre de cette phase
 * (infrastructure uniquement, aucun agent métier). Chaque outil existe
 * bien dans le registre unique (consultable, assignable en permission) ;
 * l'invoquer échoue explicitement plutôt que de simuler un résultat —
 * plus honnête qu'un faux succès. Remplacer un stub par une vraie
 * implémentation ne change ni la clé de l'outil, ni son usage par un
 * futur agent (voir `docs/02-ARCHITECTURE.md` §10).
 */
function notYetImplemented(key: string): ToolHandler {
  return {
    key,
    async handle() {
      throw new Error(
        `L'outil "${key}" est déclaré au registre mais son implémentation n'est pas encore développée.`
      );
    },
  };
}

export const placeholderTools: ToolHandler[] = [
  notYetImplemented("database.query"),
  notYetImplemented("email.send"),
  notYetImplemented("calendar.create_event"),
  notYetImplemented("documents.generate"),
  notYetImplemented("api.call_external"),
  notYetImplemented("search.web"),
  notYetImplemented("files.read"),
  notYetImplemented("pdf.generate"),
];
