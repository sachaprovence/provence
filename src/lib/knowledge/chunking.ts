/**
 * Découpage d'un texte en fragments indexables — taille fixe avec
 * recouvrement, tentant de couper sur une frontière de paragraphe/phrase
 * plutôt qu'au milieu d'un mot quand c'est possible. Aucune dépendance :
 * suffisant pour une recherche par similarité par fragment, pas un
 * découpage sémantique avancé (documenté comme limite assumée, voir
 * ADR 0027).
 */
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

export function chunkText(content: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const trimmed = content.trim();
  if (trimmed.length <= chunkSize) return trimmed.length > 0 ? [trimmed] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + chunkSize, trimmed.length);
    if (end < trimmed.length) {
      const boundary = trimmed.lastIndexOf("\n\n", end);
      const sentenceBoundary = trimmed.lastIndexOf(". ", end);
      const cut = Math.max(boundary, sentenceBoundary);
      if (cut > start + chunkSize / 2) end = cut + 1;
    }
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = end - overlap;
  }

  return chunks.filter((c) => c.length > 0);
}
