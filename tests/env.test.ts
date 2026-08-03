import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";

const VALID = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a-very-long-enough-secret-value",
};

describe("loadEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  // `process.env` est un objet global partagé par tout le processus Node :
  // si un autre fichier de test s'exécute dans le même worker Vitest après
  // celui-ci, il doit retrouver l'environnement réel (chargé depuis `.env`
  // par `loadEnvConfig` dans vitest.config.ts), pas les valeurs de test.
  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it("valide une configuration correcte et applique les valeurs par défaut", async () => {
    process.env.DATABASE_URL = VALID.DATABASE_URL;
    process.env.AUTH_SECRET = VALID.AUTH_SECRET;
    delete process.env.AI_PROVIDER;
    delete process.env.EMAIL_PROVIDER;

    const { loadEnv } = await import("@/lib/env");
    const env = loadEnv();
    expect(env.AI_PROVIDER).toBe("demo");
    expect(env.EMAIL_PROVIDER).toBe("demo");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("échoue avec un message explicite si AUTH_SECRET est trop court", async () => {
    process.env.DATABASE_URL = VALID.DATABASE_URL;
    process.env.AUTH_SECRET = "trop-court";

    const { loadEnv } = await import("@/lib/env");
    expect(() => loadEnv()).toThrow(/AUTH_SECRET/);
  });

  it("échoue si DATABASE_URL est absent", async () => {
    delete process.env.DATABASE_URL;
    process.env.AUTH_SECRET = VALID.AUTH_SECRET;

    const { loadEnv } = await import("@/lib/env");
    expect(() => loadEnv()).toThrow(/DATABASE_URL/);
  });

  it("met le résultat en cache après un premier appel réussi", async () => {
    process.env.DATABASE_URL = VALID.DATABASE_URL;
    process.env.AUTH_SECRET = VALID.AUTH_SECRET;

    const { loadEnv } = await import("@/lib/env");
    const first = loadEnv();
    process.env.AUTH_SECRET = "changed-value-should-not-matter-anymore";
    const second = loadEnv();
    expect(second).toBe(first);
  });

  it("le proxy `env` déclenche la validation seulement à la lecture d'une propriété", async () => {
    delete process.env.DATABASE_URL;
    process.env.AUTH_SECRET = VALID.AUTH_SECRET;

    const { env } = await import("@/lib/env");
    // L'import seul ne doit rien lever : la validation est paresseuse.
    expect(() => env).not.toThrow();
    // La première lecture d'une propriété déclenche la validation et échoue.
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });
});
