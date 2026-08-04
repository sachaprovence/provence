/**
 * Intitulés par défaut du pipeline commercial (v1.1, AR-0165) — repris du
 * vocabulaire du brief Provence 360 ("Prospect / Premier contact / Relance /
 * Rendez-vous / Visite programmée / Visite réalisée / Devis envoyé /
 * Négociation / Accepté / Facturé / Payé / Fidélisation"). `LeadStage` reste
 * un enum fixe de 15 valeurs (voir ADR 0043 — décision volontairement
 * conservée, une refonte en étapes libres casserait les automatisations déjà
 * câblées sur ces valeurs) : là où le brief est plus grossier que l'enum
 * interne, un qualificatif entre parenthèses distingue les colonnes du
 * Kanban sans dévier de la terminologie du brief. La facturation/le paiement/
 * la fidélisation post-vente sont suivis via `Invoice`/`Customer` (pas des
 * étapes de pipeline distinctes) ; "Visite programmée"/"Visite réalisée"
 * sont suivies via `VirtualTour.status` (voir AR-0166/0167). Ces libellés
 * restent personnalisables par organisation (`PipelineStage.label`).
 */
export const STAGE_LABEL: Record<string, string> = {
  NEW: "Prospect",
  TO_ANALYZE: "Prospect (à analyser)",
  QUALIFIED: "Prospect qualifié",
  MESSAGE_TO_VALIDATE: "Premier contact (à valider)",
  CONTACTED: "Premier contact",
  FOLLOW_UP_SCHEDULED: "Relance programmée",
  REPLIED: "Relance (réponse reçue)",
  INTERESTED: "Intéressé",
  APPOINTMENT_SCHEDULED: "Rendez-vous",
  QUOTE_SENT: "Devis envoyé",
  NEGOTIATION: "Négociation",
  WON: "Accepté",
  LOST: "Perdu",
  TO_RECONTACT_LATER: "À recontacter plus tard",
  UNSUBSCRIBED: "Désinscrit",
};

export const PIPELINE_STAGES = Object.keys(STAGE_LABEL);

export const CATEGORY_LABEL: Record<string, string> = {
  AIRBNB_HOST: "Hôte Airbnb",
  VILLA: "Villa haut de gamme",
  HOTEL: "Hôtel",
  CAMPING: "Camping",
  REAL_ESTATE_AGENCY: "Agence immobilière",
  RESTAURANT: "Restaurant",
  EVENT_VENUE: "Salle de réception",
  RETAIL: "Commerce",
  OTHER: "Autre",
};

export const STAGE_BADGE_CLASS: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-700",
  TO_ANALYZE: "bg-gray-100 text-gray-700",
  QUALIFIED: "bg-p360-lavender-light text-p360-blue",
  MESSAGE_TO_VALIDATE: "bg-p360-sand-light text-p360-warning",
  CONTACTED: "bg-p360-lavender-light text-p360-blue",
  FOLLOW_UP_SCHEDULED: "bg-p360-lavender-light text-p360-blue",
  REPLIED: "bg-blue-50 text-blue-700",
  INTERESTED: "bg-green-50 text-p360-success",
  APPOINTMENT_SCHEDULED: "bg-green-50 text-p360-success",
  QUOTE_SENT: "bg-amber-50 text-p360-warning",
  NEGOTIATION: "bg-amber-50 text-p360-warning",
  WON: "bg-green-100 text-p360-success",
  LOST: "bg-red-50 text-p360-danger",
  TO_RECONTACT_LATER: "bg-gray-100 text-gray-700",
  UNSUBSCRIBED: "bg-red-50 text-p360-danger",
};

/**
 * Classe de badge selon la CATÉGORIE de reporting d'une étape de pipeline
 * personnalisée (`PipelineStage.category`, v0.9, ADR 0038) — contrairement à
 * `STAGE_BADGE_CLASS` (indexé par `LeadStage`, figé), celle-ci reste valable
 * même quand une organisation renomme ses étapes.
 */
export const CATEGORY_BADGE_CLASS: Record<string, string> = {
  OPEN: "bg-p360-lavender-light text-p360-blue",
  WON: "bg-green-100 text-p360-success",
  LOST: "bg-red-50 text-p360-danger",
};

export const MESSAGE_TYPE_LABEL: Record<string, string> = {
  FIRST_CONTACT_EMAIL: "Email de premier contact",
  FOLLOW_UP_SHORT: "Relance courte",
  FOLLOW_UP_CASE_STUDY: "Relance avec exemple",
  LINKEDIN: "Message LinkedIn",
  CALL_SCRIPT: "Script d'appel",
  SMS: "SMS",
  PROPOSAL: "Proposition commerciale",
  APPOINTMENT_BRIEF: "Résumé avant rendez-vous",
};

export const VIRTUAL_TOUR_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Planifiée",
  SHOOTING_DONE: "Prise de vue terminée",
  PROCESSING: "En traitement",
  PUBLISHED: "Publiée",
  ARCHIVED: "Archivée",
};

export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  VILLA: "Villa",
  COMMERCIAL_PREMISES: "Local commercial",
  HOTEL_ROOM: "Chambre d'hôtel",
  OFFICE: "Bureau",
  LAND: "Terrain",
  OTHER: "Autre",
};

export const INTENT_LABEL: Record<string, string> = {
  INTERESTED: "Intéressé",
  INFO_REQUEST: "Demande d'informations",
  PRICE_REQUEST: "Demande de tarif",
  CALLBACK_REQUEST: "Demande de rappel",
  NOT_INTERESTED: "Pas intéressé",
  ALREADY_EQUIPPED: "Déjà équipé",
  WRONG_CONTACT: "Mauvais interlocuteur",
  UNSUBSCRIBE: "Désinscription",
  AUTO_REPLY: "Réponse automatique",
  INVALID_ADDRESS: "Adresse invalide",
  UNKNOWN: "Inconnu",
};
