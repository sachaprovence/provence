import { stripeDiagnosticProvider } from "../../src/lib/diagnostics/providers/stripe-diagnostic";
import { twilioDiagnosticProvider } from "../../src/lib/diagnostics/providers/twilio-diagnostic";
import { gmailDiagnosticProvider } from "../../src/lib/diagnostics/providers/gmail-diagnostic";
import { outlookDiagnosticProvider } from "../../src/lib/diagnostics/providers/outlook-diagnostic";
import { s3DiagnosticProvider } from "../../src/lib/diagnostics/providers/s3-diagnostic";
import type {
  IntegrationDiagnosticProvider,
  IntegrationConfigState,
  IntegrationTestResult,
} from "../../src/lib/diagnostics/types";
import { INTEGRATION_DIAGNOSTIC_STATUS_LABELS } from "../../src/lib/diagnostics/types";

/**
 * Logique de preuve de validation des intégrations tierces (v1.3, AR-0172) —
 * sans effet de bord au chargement du module (aucun `main()`), afin de rester
 * importable en toute sécurité depuis les tests (voir `scripts/lib/db-backup.ts`
 * pour le même principe appliqué en AR-0166). Le point d'entrée CLI se trouve
 * dans `scripts/validate-integrations.ts`.
 *
 * Ne fabrique JAMAIS de preuve : si aucun compte réel n'est configuré, l'état
 * `NOT_CONFIGURED` est rapporté honnêtement — jamais un succès simulé.
 */
export interface ProviderEvidence {
  key: string;
  label: string;
  configState: IntegrationConfigState;
  configStateLabel: string;
  test: IntegrationTestResult | null;
  realAccountValidated: false;
  note: string;
}

export const INTEGRATION_VALIDATION_PROVIDERS: IntegrationDiagnosticProvider[] = [
  stripeDiagnosticProvider,
  twilioDiagnosticProvider,
  gmailDiagnosticProvider,
  outlookDiagnosticProvider,
  s3DiagnosticProvider,
];

export async function evaluateProvider(
  provider: IntegrationDiagnosticProvider,
  organizationId: string,
): Promise<ProviderEvidence> {
  const configState = await provider.getConfigState(organizationId);
  let test: IntegrationTestResult | null = null;
  if (configState === "CONFIGURED") {
    test = await provider.testConnection(organizationId);
  }

  return {
    key: provider.key,
    label: provider.label,
    configState,
    configStateLabel: INTEGRATION_DIAGNOSTIC_STATUS_LABELS[configState],
    test,
    realAccountValidated: false,
    note:
      configState === "NOT_CONFIGURED"
        ? "Aucun identifiant fourni — validation contre un compte réel impossible tant qu'aucun identifiant n'est configuré."
        : configState === "PARTIALLY_CONFIGURED"
          ? "Configuration incomplète — compléter les identifiants avant de pouvoir tester la connexion."
          : "Configuration complète détectée ; le résultat du test ci-dessus provient de l'appel réel effectué à l'instant, mais N'A PAS été vérifié contre un compte de test officiel distinct par un opérateur humain — voir AR-0172.",
  };
}

export async function evaluateAllProviders(organizationId: string): Promise<ProviderEvidence[]> {
  const evidence: ProviderEvidence[] = [];
  for (const provider of INTEGRATION_VALIDATION_PROVIDERS) {
    evidence.push(await evaluateProvider(provider, organizationId));
  }
  return evidence;
}

export function renderMarkdown(evidence: ProviderEvidence[], organizationId: string): string {
  const rows = evidence
    .map((e) => {
      const testCell = e.test ? `${INTEGRATION_DIAGNOSTIC_STATUS_LABELS[e.test.status]} — ${e.test.message}` : "(non tenté)";
      return `| ${e.label} | ${e.configStateLabel} | ${testCell} |`;
    })
    .join("\n");

  return `# Preuve de validation des intégrations — v1.3 (AR-0172)

- **Date d'exécution** : ${new Date().toISOString()}
- **Organisation utilisée** (Twilio/Gmail/Outlook) : \`${organizationId}\`
- **Généré par** : \`scripts/validate-integrations.ts\`

**⚠️ Aucune de ces intégrations n'a été validée contre un compte réel ou
un sandbox officiel tiers dans le cadre de cette exécution** — voir la
colonne "Remarque" pour chaque ligne. Une validation réelle nécessite que
l'opérateur fournisse des identifiants Stripe (mode test), un compte
Google/Microsoft de test avec OAuth configuré, un bucket S3 réel, et un
compte Twilio de test, puis réexécute ce script.

| Intégration | État de configuration | Résultat du test de connexion |
|---|---|---|
${rows}

## Détail par intégration

${evidence.map((e) => `### ${e.label}\n\n- État : **${e.configStateLabel}**\n- ${e.note}\n`).join("\n")}
`;
}
