import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { LOGGER_OPTIONS } from "@/lib/logger";

/**
 * AR-0047 (v0.9 bis) — le logger structuré (pino) et sa politique de
 * redaction existent depuis une phase antérieure à v0.9 bis
 * (`src/lib/logger.ts`), mais n'avaient jamais de test prouvant que la
 * redaction fonctionne réellement. Reconstruit un pino avec EXACTEMENT
 * les mêmes options que le logger réel (`LOGGER_OPTIONS`, exporté pour
 * ce seul besoin) mais contre un flux `Writable` en mémoire — le pino
 * réel écrit directement sur le descripteur de fichier stdout (via
 * `sonic-boom`), qui ne passe jamais par `process.stdout.write` et ne
 * peut donc pas être intercepté par un simple mock de méthode.
 */
function createCapturingLogger() {
  let captured = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      captured += chunk.toString();
      callback();
    },
  });
  const testLogger = pino(LOGGER_OPTIONS, stream);
  return { testLogger, getOutput: () => captured };
}

describe("logger — redaction des champs sensibles (pino)", () => {
  it("masque password/token/secret/authorization, jamais en clair dans la sortie", () => {
    const { testLogger, getOutput } = createCapturingLogger();
    testLogger.info(
      {
        password: "s3cr3t-pw",
        token: "tok-abc123",
        authSecret: "auth-secret-value",
        nested: { secret: "nested-secret-value" },
        req: { headers: { authorization: "Bearer abc.def.ghi", cookie: "session=xyz" } },
      },
      "Test de redaction"
    );

    const output = getOutput();
    expect(output).not.toContain("s3cr3t-pw");
    expect(output).not.toContain("tok-abc123");
    expect(output).not.toContain("auth-secret-value");
    expect(output).not.toContain("nested-secret-value");
    expect(output).not.toContain("Bearer abc.def.ghi");
    expect(output).not.toContain("session=xyz");
    expect(output).toContain("[REDACTED]");
  });

  it("un logger enfant (child, même patron que createModuleLogger) applique la même redaction", () => {
    const { testLogger, getOutput } = createCapturingLogger();
    const moduleLogger = testLogger.child({ module: "test-module" });
    moduleLogger.warn({ passwordHash: "hash-should-not-leak" }, "Test module logger");

    const output = getOutput();
    expect(output).not.toContain("hash-should-not-leak");
    expect(output).toContain("test-module");
  });

  it("un champ non sensible reste visible en clair (la redaction n'est pas globale)", () => {
    const { testLogger, getOutput } = createCapturingLogger();
    testLogger.info({ organizationId: "org-visible-123" }, "Test champ non sensible");

    expect(getOutput()).toContain("org-visible-123");
  });
});
