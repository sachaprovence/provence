import { describe, expect, it } from "vitest";
import {
  TEMP_DB_NAME_PATTERN,
  UnsafeTempDbNameError,
  realAppDbName,
  generateTempDbName,
  assertSafeTempDbName,
  adminConnectionUrl,
  tempConnectionUrl,
  pgToolConnectionUrl,
} from "../../scripts/lib/temp-db-guardrails";

const REAL_DB_URL = "postgresql://provence:provence@localhost:5432/provence360?schema=public";

describe("temp-db-guardrails (AR-0163)", () => {
  it("génère toujours un nom respectant le format temporaire attendu", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateTempDbName()).toMatch(TEMP_DB_NAME_PATTERN);
    }
  });

  it("génère un nom différent à chaque appel", () => {
    const a = generateTempDbName();
    const b = generateTempDbName();
    expect(a).not.toBe(b);
  });

  it("extrait correctement le nom de la base réelle depuis DATABASE_URL", () => {
    expect(realAppDbName(REAL_DB_URL)).toBe("provence360");
  });

  it("accepte un nom généré par generateTempDbName", () => {
    const name = generateTempDbName();
    expect(() => assertSafeTempDbName(name, "provence360")).not.toThrow();
  });

  it("refuse un nom qui ne respecte pas le format temporaire (garde-fou #1)", () => {
    expect(() => assertSafeTempDbName("provence360_copy", "provence360")).toThrow(UnsafeTempDbNameError);
    expect(() => assertSafeTempDbName("autorun_migtest_abc", "provence360")).toThrow(UnsafeTempDbNameError);
    expect(() => assertSafeTempDbName("random_name", "provence360")).toThrow(UnsafeTempDbNameError);
  });

  it("refuse un nom qui correspond exactement à la base applicative réelle (garde-fou #2)", () => {
    // Cas impossible en pratique (la base réelle ne respecte jamais le format
    // temporaire), mais vérifié explicitement en défense en profondeur : même
    // si le format matchait par accident, l'égalité avec le nom réel bloque.
    const collidingName = "autorun_migtest_1234567890_deadbeef";
    expect(() => assertSafeTempDbName(collidingName, collidingName)).toThrow(UnsafeTempDbNameError);
  });

  it("n'accepte JAMAIS le nom de la base réelle telle quelle, même sans format temporaire", () => {
    expect(() => assertSafeTempDbName("provence360", "provence360")).toThrow(UnsafeTempDbNameError);
  });

  it("préserve l'hôte/port/identifiants mais pointe vers `postgres` pour la connexion admin", () => {
    const url = adminConnectionUrl(REAL_DB_URL);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/postgres");
    expect(parsed.hostname).toBe("localhost");
    expect(parsed.port).toBe("5432");
    expect(parsed.username).toBe("provence");
  });

  it("préserve l'hôte/port/identifiants mais pointe vers la base temporaire", () => {
    const tempName = generateTempDbName();
    const url = tempConnectionUrl(REAL_DB_URL, tempName);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/${tempName}`);
    expect(parsed.hostname).toBe("localhost");
    expect(parsed.username).toBe("provence");
  });

  describe("pgToolConnectionUrl (AR-0166)", () => {
    it("retire le paramètre schema, non reconnu par pg_dump/pg_restore/psql", () => {
      const url = pgToolConnectionUrl(REAL_DB_URL);
      expect(new URL(url).searchParams.has("schema")).toBe(false);
    });

    it("préserve hôte/port/identifiants/base de données", () => {
      const parsed = new URL(pgToolConnectionUrl(REAL_DB_URL));
      expect(parsed.hostname).toBe("localhost");
      expect(parsed.port).toBe("5432");
      expect(parsed.username).toBe("provence");
      expect(parsed.pathname).toBe("/provence360");
    });

    it("ne modifie rien si aucun paramètre schema n'est présent", () => {
      const withoutSchema = "postgresql://provence:provence@localhost:5432/provence360";
      expect(pgToolConnectionUrl(withoutSchema)).toBe(withoutSchema);
    });
  });
});
