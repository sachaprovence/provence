import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { scanContent, type SecretFinding } from "./lib/secret-scan";

/**
 * Scan de secrets — point d'entrée CLI (v1.3, AR-0176). Analyse uniquement
 * les fichiers SUIVIS par git (`git ls-files`), jamais l'historique complet
 * (hors périmètre : une fuite déjà purgée du HEAD actuel n'est plus un
 * risque d'exposition via le dépôt tel que cloné aujourd'hui). Logique de
 * détection dans `scripts/lib/secret-scan.ts`.
 *
 * Usage : `npx tsx scripts/scan-secrets.ts` — code de sortie non nul si au
 * moins une correspondance de haute confiance est trouvée, ou une
 * correspondance générique non explicitement exclue.
 */
const EXCLUDED_PATH_PREFIXES = ["node_modules/", ".next/", "prisma/migrations/"];

function listTrackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files"], { encoding: "utf-8" });
  return output
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDED_PATH_PREFIXES.some((prefix) => f.startsWith(prefix)));
}

function main() {
  const files = listTrackedFiles();
  console.log(`→ Analyse de ${files.length} fichier(s) suivi(s) par git...`);

  const allFindings: SecretFinding[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue; // Fichier binaire ou illisible en UTF-8 — jamais un secret exploitable en texte clair.
    }
    allFindings.push(...scanContent(file, content));
  }

  if (allFindings.length === 0) {
    console.log("\n✅ Aucun secret détecté.");
    return;
  }

  console.error(`\n❌ ${allFindings.length} correspondance(s) suspecte(s) :\n`);
  for (const finding of allFindings) {
    console.error(`  [${finding.highConfidence ? "HAUTE CONFIANCE" : "à vérifier"}] ${finding.patternName}`);
    console.error(`    ${finding.file}:${finding.line} — ${finding.excerpt}`);
  }
  process.exitCode = 1;
}

main();
