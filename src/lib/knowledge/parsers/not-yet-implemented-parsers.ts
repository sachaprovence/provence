import "server-only";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { DocumentParser } from "./types";

/**
 * Sources déclarées au registre (visibles, sélectionnables) mais dont
 * l'extraction réelle est hors périmètre de cette phase — même principe
 * honnête que les placeholders du Framework des Agents (v0.3) et les
 * actions non implémentées du Workflow Engine (v0.6). Voir ADR 0027 :
 *
 * - **PDF/Word/Excel/PowerPoint** : nécessitent une bibliothèque
 *   d'extraction dédiée (`pdf-parse`, `mammoth`, `exceljs`...), qui n'est
 *   pas une dépendance du projet aujourd'hui (convention établie : aucune
 *   dépendance ajoutée sans besoin validé, voir v0.6). Ajouter un vrai
 *   parseur = remplacer ce stub par une implémentation, sans changer sa
 *   clé ni son usage par le pipeline d'ingestion.
 * - **Invoice** : aucun modèle de facture n'existe encore dans Provence
 *   360 (`MOD-12`, toujours reporté — voir ROADMAP.md).
 * - **Image/Audio/Video** : "préparer l'architecture" demandé
 *   explicitement, pas une extraction fonctionnelle — l'énumération
 *   `KnowledgeSourceType` et ce point d'extension existent, une future
 *   implémentation (OCR, transcription, description d'image par un
 *   modèle de vision) s'y branchera sans changement de schéma.
 */
function notYetImplemented(sourceType: KnowledgeSourceType): DocumentParser {
  return {
    sourceType,
    async parse() {
      throw new Error(
        `L'extraction de la source "${sourceType}" est déclarée au registre mais son implémentation n'est pas encore développée.`
      );
    },
  };
}

export const notYetImplementedParsers: DocumentParser[] = [
  notYetImplemented(KnowledgeSourceType.PDF),
  notYetImplemented(KnowledgeSourceType.WORD),
  notYetImplemented(KnowledgeSourceType.EXCEL),
  notYetImplemented(KnowledgeSourceType.POWERPOINT),
  notYetImplemented(KnowledgeSourceType.INVOICE),
  notYetImplemented(KnowledgeSourceType.IMAGE),
  notYetImplemented(KnowledgeSourceType.AUDIO),
  notYetImplemented(KnowledgeSourceType.VIDEO),
];
