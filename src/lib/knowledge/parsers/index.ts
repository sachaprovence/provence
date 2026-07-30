import "server-only";
import { registerDocumentParser } from "./registry";
import { textParsers } from "./text-parsers";
import { recordParsers } from "./record-parsers";
import { notYetImplementedParsers } from "./not-yet-implemented-parsers";

let registered = false;

export function registerBuiltInDocumentParsers(): void {
  if (registered) return;
  registered = true;

  for (const parser of [...textParsers, ...recordParsers, ...notYetImplementedParsers]) {
    registerDocumentParser(parser);
  }
}

export * from "./types";
export * from "./registry";
