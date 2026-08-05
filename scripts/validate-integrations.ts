import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { INTEGRATION_DIAGNOSTIC_STATUS_LABELS } from "../src/lib/diagnostics/types";
import {
  evaluateProvider,
  renderMarkdown,
  INTEGRATION_VALIDATION_PROVIDERS,
  type ProviderEvidence,
} from "./lib/integration-validation";

/**
 * Preuve de validation des intégrations tierces (v1.3, AR-0172) — script CLI
 * en lecture seule qui produit un rapport structuré (Markdown + JSON) de
 * l'état RÉEL de chaque intégration au moment de l'exécution.
 *
 * Réutilise directement les fournisseurs de diagnostic de
 * `src/lib/diagnostics/providers/` (AR-0165, v1.2) plutôt que d'inventer une
 * seconde logique de vérification, et volontairement SANS passer par
 * `integration-diagnostics-service.ts` (limitation de débit + écriture en
 * base) : ce script est un outil de production de PREUVE ponctuelle (audit,
 * recette), pas une action utilisateur répétée depuis l'interface.
 *
 * Usage : `npx tsx scripts/validate-integrations.ts [organizationId]`
 */
async function main() {
  const organizationId = process.argv[2] ?? "cli-validation-no-organization";

  console.log(`→ Validation des intégrations (organisation de référence : ${organizationId})...`);
  const evidence: ProviderEvidence[] = [];
  for (const provider of INTEGRATION_VALIDATION_PROVIDERS) {
    process.stdout.write(`  ${provider.label}... `);
    const result = await evaluateProvider(provider, organizationId);
    evidence.push(result);
    console.log(`${result.configStateLabel}${result.test ? ` → ${INTEGRATION_DIAGNOSTIC_STATUS_LABELS[result.test.status]}` : ""}`);
  }

  const outputDir = path.join(process.cwd(), "docs", "release");
  fs.mkdirSync(outputDir, { recursive: true });
  const markdownPath = path.join(outputDir, "integration-validation-evidence-v1.3.md");
  const jsonPath = path.join(outputDir, "integration-validation-evidence-v1.3.json");

  fs.writeFileSync(markdownPath, renderMarkdown(evidence, organizationId));
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), organizationId, evidence }, null, 2));

  console.log(`\n✅ Rapport de preuve écrit : ${markdownPath}`);
  console.log(`   Données structurées : ${jsonPath}`);

  const anyRealAccount = evidence.some((e) => e.realAccountValidated);
  if (!anyRealAccount) {
    console.log("\n⚠️  Aucune intégration validée contre un compte réel — voir AR-0172, action requise de l'opérateur.");
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
