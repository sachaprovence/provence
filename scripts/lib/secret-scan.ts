/**
 * Logique de détection de secrets (v1.3, AR-0176) — extraite sans `main()`
 * (même convention que `db-backup.ts`/`backup-retention.ts`) pour être
 * importable en sécurité par les tests. Le point d'entrée CLI est
 * `scripts/scan-secrets.ts`.
 *
 * Comble un manque identifié dès la revue OWASP v0.10
 * (`docs/security/owasp-review-2026-08-03.md`, constat P1 : "Aucun scan de
 * secrets automatisé en CI"). Volontairement écrit maison (pas de
 * dépendance à gitleaks/trufflehog) — deux catégories de détection :
 * 1. Formats de secrets connus (haute confiance, jamais de faux positif
 *    plausible) : clé AWS, clé privée PEM, clé Stripe live, jeton GitHub,
 *    jeton Slack.
 * 2. Heuristique générique : `password`/`secret`/`token`/`apiKey` assigné à
 *    un littéral de chaîne — sujette à des faux positifs légitimes,
 *    filtrée par une liste d'exclusion documentée plutôt que supprimée
 *    silencieusement.
 */
export interface SecretPattern {
  name: string;
  regex: RegExp;
  highConfidence: boolean;
}

export const PATTERNS: SecretPattern[] = [
  { name: "Clé d'accès AWS", regex: /AKIA[0-9A-Z]{16}/g, highConfidence: true },
  { name: "Clé privée PEM", regex: /-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY-----/g, highConfidence: true },
  { name: "Clé secrète Stripe (live)", regex: /sk_live_[0-9a-zA-Z]{20,}/g, highConfidence: true },
  { name: "Jeton GitHub (personal access token)", regex: /gh[ps]_[0-9A-Za-z]{30,}/g, highConfidence: true },
  { name: "Jeton Slack", regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g, highConfidence: true },
  {
    name: "Littéral assigné à un champ sensible (password/secret/token/apiKey)",
    regex: /\b(password|secret|token|apiKey|api_key)\s*[:=]\s*["'][^"'\n]{8,}["']/gi,
    highConfidence: false,
  },
];

/** Valeurs explicitement sûres pour la détection générique (faux positifs légitimes documentés). */
export const SAFE_VALUE_FRAGMENTS = [
  "process.env",
  "REDACTED",
  "placeholder",
  "example",
  "changeme",
  "change-me",
  "not-a-real",
  "not_for_production",
  "ci-secret",
  "dev-secret",
  "demo12345",
  "already-set",
  "whatever",
  "mauvais-secret",
  "wrong-secret",
  "le-vrai-secret",
  "test-",
  "demo-",
];

export interface SecretFinding {
  file: string;
  line: number;
  patternName: string;
  highConfidence: boolean;
  excerpt: string;
}

/**
 * Les fichiers de test contiennent, PAR CONCEPTION, des identifiants
 * fictifs qui ressemblent à de vrais secrets (mots de passe de compte de
 * démonstration, clés d'API factices pour simuler un fournisseur) — la
 * détection générique (basse confiance) y produirait un bruit constant
 * sans jamais signaler un vrai risque. Les formats de secrets connus
 * (haute confiance : clé AWS, clé privée PEM...) restent recherchés
 * PARTOUT, y compris dans les tests — un vrai secret collé par erreur
 * dans un fichier de test resterait un vrai risque.
 */
function isTestFile(file: string): boolean {
  return file.startsWith("tests/") || file.includes("/tests/") || /\.(test|spec)\.[jt]sx?$/.test(file);
}

export function scanContent(file: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");
  const skipGenericPattern = isTestFile(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of PATTERNS) {
      if (!pattern.highConfidence && skipGenericPattern) continue;

      const matches = line.match(pattern.regex);
      if (!matches) continue;

      if (!pattern.highConfidence && SAFE_VALUE_FRAGMENTS.some((safe) => line.toLowerCase().includes(safe.toLowerCase()))) {
        continue;
      }

      findings.push({ file, line: i + 1, patternName: pattern.name, highConfidence: pattern.highConfidence, excerpt: line.trim().slice(0, 160) });
    }
  }

  return findings;
}
