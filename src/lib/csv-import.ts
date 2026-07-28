import Papa from "papaparse";
import { csvColumnMap, type LeadCsvField } from "@/lib/validations/lead";

export function parseCsv(text: string) {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return { headers: result.meta.fields ?? [], rows: result.data, errors: result.errors };
}

/** Fait correspondre automatiquement les colonnes du fichier aux champs connus. */
export function suggestColumnMapping(headers: string[]): Partial<Record<LeadCsvField, string>> {
  const mapping: Partial<Record<LeadCsvField, string>> = {};
  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    for (const [field, synonyms] of Object.entries(csvColumnMap) as [LeadCsvField, readonly string[]][]) {
      if (synonyms.some((s) => s.toLowerCase() === normalized)) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

export type MappedLeadRow = {
  establishmentName: string;
  category?: string;
  contactName?: string;
  contactJobTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  publicListingUrl?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  reviewCount?: number;
  averageRating?: number;
  tags?: string[];
  notes?: string;
  rowErrors: string[];
};

const CATEGORY_ALIASES: Record<string, string> = {
  airbnb: "AIRBNB_HOST",
  "logement airbnb": "AIRBNB_HOST",
  villa: "VILLA",
  hotel: "HOTEL",
  hôtel: "HOTEL",
  camping: "CAMPING",
  "agence immobilière": "REAL_ESTATE_AGENCY",
  "agence immobiliere": "REAL_ESTATE_AGENCY",
  restaurant: "RESTAURANT",
  "salle de réception": "EVENT_VENUE",
  "salle de reception": "EVENT_VENUE",
  commerce: "RETAIL",
};

function guessCategory(raw?: string): string {
  if (!raw) return "OTHER";
  const key = raw.trim().toLowerCase();
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const known = ["AIRBNB_HOST", "VILLA", "HOTEL", "CAMPING", "REAL_ESTATE_AGENCY", "RESTAURANT", "EVENT_VENUE", "RETAIL", "OTHER"];
  return known.includes(upper) ? upper : "OTHER";
}

export function mapRow(row: Record<string, string>, mapping: Partial<Record<LeadCsvField, string>>): MappedLeadRow {
  const rowErrors: string[] = [];
  const get = (field: LeadCsvField) => {
    const col = mapping[field];
    return col ? row[col]?.trim() : undefined;
  };

  const establishmentName = get("establishmentName") || "";
  if (!establishmentName) rowErrors.push("Nom de l'établissement manquant.");

  const contactEmail = get("contactEmail");
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    rowErrors.push("Adresse email invalide.");
  }

  const reviewCountRaw = get("reviewCount");
  const reviewCount = reviewCountRaw ? Number(reviewCountRaw.replace(",", ".")) : undefined;
  const averageRatingRaw = get("averageRating");
  const averageRating = averageRatingRaw ? Number(averageRatingRaw.replace(",", ".")) : undefined;

  return {
    establishmentName,
    category: guessCategory(get("category")),
    contactName: get("contactName"),
    contactJobTitle: get("contactJobTitle"),
    contactEmail: contactEmail || undefined,
    contactPhone: get("contactPhone"),
    websiteUrl: get("websiteUrl"),
    publicListingUrl: get("publicListingUrl"),
    address: get("address"),
    city: get("city"),
    region: get("region"),
    country: get("country"),
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : undefined,
    averageRating: Number.isFinite(averageRating) ? averageRating : undefined,
    tags: get("tags")
      ?.split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean),
    notes: get("notes"),
    rowErrors,
  };
}

export const CSV_TEMPLATE_HEADERS = [
  "nom de l'établissement",
  "catégorie",
  "nom du contact",
  "fonction",
  "email",
  "téléphone",
  "site internet",
  "url fiche",
  "adresse",
  "ville",
  "région",
  "pays",
  "nombre d'avis",
  "note moyenne",
  "tags",
  "notes",
];

export const CSV_TEMPLATE_EXAMPLE = [
  "Villa Les Lavandes",
  "villa",
  "Marie Dupont",
  "Propriétaire",
  "contact@villalavandes.example",
  "+33612345678",
  "https://villalavandes.example",
  "https://www.airbnb.fr/rooms/exemple",
  "12 chemin des Lavandes",
  "Gordes",
  "Vaucluse",
  "France",
  "42",
  "4.8",
  "haut de gamme;piscine",
  "Contactée une fois en 2025",
];
