import type { IntegrationDiagnosticKey, IntegrationDiagnosticStatus } from "@/generated/prisma/enums";

/**
 * Écran de diagnostic des intégrations (v1.2, AR-0165, voir ADR 0045) —
 * types partagés par les 5 fournisseurs de diagnostic
 * (`src/lib/diagnostics/providers/`) et l'orchestrateur
 * (`integration-diagnostics-service.ts`). Séparé d'`IntegrationKind`
 * (Prisma) car Stripe et S3 n'ont pas de ligne `Integration` — leur
 * configuration est un réglage de déploiement (variables d'environnement),
 * jamais par organisation.
 */

/** Libellés français des 6 états, dans l'ordre exact spécifié pour l'écran de diagnostic. */
export const INTEGRATION_DIAGNOSTIC_STATUS_LABELS: Record<IntegrationDiagnosticStatus, string> = {
  NOT_CONFIGURED: "non configurée",
  PARTIALLY_CONFIGURED: "partiellement configurée",
  CONFIGURED: "configurée",
  TEST_SUCCESS: "test réussi",
  TEST_FAILED: "test échoué",
  UNAVAILABLE: "indisponible",
};

export const INTEGRATION_DIAGNOSTIC_LABELS: Record<IntegrationDiagnosticKey, string> = {
  STRIPE: "Stripe (facturation)",
  TWILIO: "Twilio (SMS / WhatsApp / Téléphone)",
  GMAIL: "Gmail",
  OUTLOOK: "Outlook",
  S3_STORAGE: "Stockage S3",
};

/** État de configuration calculé SANS aucun appel réseau — jamais `TEST_*`/`UNAVAILABLE`, réservés au résultat d'un test explicite. */
export type IntegrationConfigState = Extract<IntegrationDiagnosticStatus, "NOT_CONFIGURED" | "PARTIALLY_CONFIGURED" | "CONFIGURED">;

/** Résultat d'un test de connexion réel — `message` est TOUJOURS un texte sûr (jamais de secret, jamais la configuration). */
export interface IntegrationTestResult {
  status: Extract<IntegrationDiagnosticStatus, "TEST_SUCCESS" | "TEST_FAILED" | "UNAVAILABLE">;
  message: string;
}

/** Contrat implémenté par chaque `src/lib/diagnostics/providers/*.ts`. */
export interface IntegrationDiagnosticProvider {
  key: IntegrationDiagnosticKey;
  label: string;
  /** Calcule l'état de configuration, sans jamais contacter le service tiers. */
  getConfigState(organizationId: string): Promise<IntegrationConfigState>;
  /** N'est appelé par l'orchestrateur QUE si `getConfigState` a renvoyé `CONFIGURED` — voir `runIntegrationDiagnosticTest`. */
  testConnection(organizationId: string): Promise<IntegrationTestResult>;
}

export interface IntegrationDiagnosticSummary {
  key: IntegrationDiagnosticKey;
  label: string;
  status: IntegrationDiagnosticStatus;
  statusLabel: string;
  /** `null` si aucun test n'a jamais été exécuté (état purement déclaratif). */
  message: string | null;
  /** Un test de connexion peut être déclenché maintenant (configuration complète). */
  testable: boolean;
  lastCheckedAt: string | null;
  lastCheckedBy: { id: string; firstName: string; lastName: string } | null;
}
