import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { createModuleLogger } from "@/lib/logger";
import type { IntegrationDiagnosticKey } from "@/generated/prisma/enums";
import { assertDiagnosticTestRateLimitAvailable } from "./rate-limit";
import { INTEGRATION_DIAGNOSTIC_STATUS_LABELS, type IntegrationDiagnosticProvider, type IntegrationDiagnosticSummary } from "./types";
import { stripeDiagnosticProvider } from "./providers/stripe-diagnostic";
import { twilioDiagnosticProvider } from "./providers/twilio-diagnostic";
import { gmailDiagnosticProvider } from "./providers/gmail-diagnostic";
import { outlookDiagnosticProvider } from "./providers/outlook-diagnostic";
import { s3DiagnosticProvider } from "./providers/s3-diagnostic";

/**
 * Orchestrateur du diagnostic des intégrations (v1.2, AR-0165, voir ADR
 * 0045) — point d'entrée unique consommé par l'API/l'UI. Ne construit
 * JAMAIS un objet contenant un secret : chaque fournisseur
 * (`src/lib/diagnostics/providers/*.ts`) ne renvoie qu'un état et un
 * message textuel déjà sûrs (voir `IntegrationTestResult` dans `types.ts`).
 */
const log = createModuleLogger("integration-diagnostics");

const PROVIDERS: Record<IntegrationDiagnosticKey, IntegrationDiagnosticProvider> = {
  STRIPE: stripeDiagnosticProvider,
  TWILIO: twilioDiagnosticProvider,
  GMAIL: gmailDiagnosticProvider,
  OUTLOOK: outlookDiagnosticProvider,
  S3_STORAGE: s3DiagnosticProvider,
};

async function summarize(organizationId: string, provider: IntegrationDiagnosticProvider): Promise<IntegrationDiagnosticSummary> {
  const configState = await provider.getConfigState(organizationId);
  const lastCheck = await prisma.integrationDiagnosticCheck.findFirst({
    where: { organizationId, integration: provider.key },
    orderBy: { createdAt: "desc" },
    include: { checkedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  // Le dernier résultat de test connu ne prime sur l'état de configuration
  // calculé QUE si la configuration est toujours complète — sinon un test
  // réussi avant qu'un identifiant soit retiré afficherait à tort "test
  // réussi" alors que l'intégration n'est plus utilisable.
  const status = lastCheck && configState === "CONFIGURED" ? lastCheck.status : configState;

  return {
    key: provider.key,
    label: provider.label,
    status,
    statusLabel: INTEGRATION_DIAGNOSTIC_STATUS_LABELS[status],
    message: status === configState ? null : lastCheck!.message,
    testable: configState === "CONFIGURED",
    lastCheckedAt: lastCheck ? lastCheck.createdAt.toISOString() : null,
    lastCheckedBy: lastCheck?.checkedBy ?? null,
  };
}

export async function listIntegrationDiagnostics(organizationId: string): Promise<IntegrationDiagnosticSummary[]> {
  return Promise.all(Object.values(PROVIDERS).map((provider) => summarize(organizationId, provider)));
}

/**
 * Déclenche un test de connexion réel — refuse si la configuration n'est
 * pas complète (jamais d'appel réseau vers un tiers avec des identifiants
 * partiels/absents) et applique une limitation de débit (protège à la fois
 * l'écran de diagnostic et l'API tierce elle-même).
 */
export async function runIntegrationDiagnosticTest(
  organizationId: string,
  key: IntegrationDiagnosticKey,
  actorId: string
): Promise<IntegrationDiagnosticSummary> {
  const provider = PROVIDERS[key];
  assertDiagnosticTestRateLimitAvailable(organizationId, key);

  const configState = await provider.getConfigState(organizationId);
  if (configState !== "CONFIGURED") {
    throw new ValidationError(
      `Impossible de tester "${provider.label}" : configuration incomplète (état actuel : ${INTEGRATION_DIAGNOSTIC_STATUS_LABELS[configState]}).`
    );
  }

  const result = await provider.testConnection(organizationId);

  await prisma.integrationDiagnosticCheck.create({
    data: {
      organizationId,
      integration: key,
      status: result.status,
      message: result.message.slice(0, 500),
      checkedById: actorId,
    },
  });

  // Jamais le message (peut décrire un détail d'erreur du fournisseur tiers) ni la configuration — seulement le résultat structuré.
  log.info({ organizationId, integration: key, status: result.status }, "Test de connexion d'intégration exécuté.");

  return summarize(organizationId, provider);
}
