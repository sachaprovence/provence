import "server-only";
import { ValidationError } from "@/lib/errors";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { DocumentParser, ParseInput, ParsedDocument } from "./types";

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim().slice(0, 200) ?? "(sans titre)";
}

function requireRaw(input: ParseInput, sourceType: string): string {
  if (input.raw === undefined) throw new ValidationError(`La source "${sourceType}" nécessite un contenu brut ("raw").`);
  return input.raw;
}

/** Markdown/Note/Documentation/Email : contenu déjà textuel, passthrough — le titre est fourni explicitement ou dérivé du premier titre `#`/de la première ligne non vide. */
function createPassthroughParser(sourceType: KnowledgeSourceType): DocumentParser {
  return {
    sourceType,
    async parse(input: ParseInput): Promise<ParsedDocument> {
      const raw = requireRaw(input, sourceType);
      const heading = raw.match(/^#{1,6}\s+(.+)$/m)?.[1];
      return { title: input.title ?? heading ?? firstLine(raw), content: raw };
    },
  };
}

/** HTML : retrait des balises (regex, sans dépendance de parsing DOM) — suffisant pour extraire un texte indexable, pas un rendu fidèle. */
const htmlParser: DocumentParser = {
  sourceType: KnowledgeSourceType.HTML,
  async parse(input: ParseInput): Promise<ParsedDocument> {
    const raw = requireRaw(input, "HTML");
    const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i) ?? raw.match(/<h1[^>]*>([^<]*)<\/h1>/i);
    const content = raw
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return { title: input.title ?? titleMatch?.[1]?.trim() ?? firstLine(content), content };
  },
};

export const textParsers: DocumentParser[] = [
  createPassthroughParser(KnowledgeSourceType.MARKDOWN),
  createPassthroughParser(KnowledgeSourceType.NOTE),
  createPassthroughParser(KnowledgeSourceType.DOCUMENTATION),
  createPassthroughParser(KnowledgeSourceType.EMAIL),
  htmlParser,
];
