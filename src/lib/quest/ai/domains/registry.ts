import "server-only";
import type { DomainHandler } from "../goal-domain";
import { runningDomain } from "./running";
import { strengthDomain } from "./strength";
import { businessDomain } from "./business";
import { salesDomain } from "./sales";
import { languageDomain } from "./language";
import { savingsDomain } from "./savings";
import { quitHabitDomain } from "./quit-habit";

/**
 * Ordre de reconnaissance délibéré : du plus spécifique (course à pied,
 * musculation, langue, tabac — vocabulaire très distinctif) au plus large
 * (`SALES` avant `BUSINESS` : "trouver des clients" est plus précis que
 * "entreprise", qui pourrait matcher en même temps).
 */
const HANDLERS: DomainHandler[] = [runningDomain, strengthDomain, languageDomain, quitHabitDomain, salesDomain, businessDomain, savingsDomain];

export function detectDomainHandler(title: string, description: string | null): DomainHandler | null {
  return HANDLERS.find((handler) => handler.matches(title, description)) ?? null;
}

export { runningDomain, strengthDomain, businessDomain, salesDomain, languageDomain, savingsDomain, quitHabitDomain };
