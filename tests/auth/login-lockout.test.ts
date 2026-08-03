import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertLoginNotLocked } from "@/lib/auth";
import { TooManyRequestsError } from "@/lib/errors";

/**
 * Verrouillage de compte durable (v0.10, AR-0155) — corrige un manque
 * réel : chaque tentative de connexion échouée était déjà journalisée
 * (`LoginEvent`, depuis v0.1) mais rien ne la relisait jamais pour bloquer
 * un compte. `assertLoginNotLocked` repose sur cette même table (Postgres,
 * partagée entre toutes les instances) — jamais un compteur en mémoire.
 *
 * L'intégration dans `POST /api/auth/login` (429 après trop d'échecs)
 * n'est pas testable en appelant directement le handler exporté : cette
 * route appelle `next/headers` (via `recordLoginEvent`/`createSession`),
 * qui exige un contexte de requête Next.js réel — impossible à simuler
 * hors d'un serveur réellement démarré (même limite déjà rencontrée pour
 * tout le reste de la suite : aucun test de ce dépôt n'invoque un handler
 * de route utilisant `next/headers`). Vérifiée manuellement contre un
 * serveur de production réellement démarré (voir validation finale v0.10).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("assertLoginNotLocked", () => {
  const emails: string[] = [];

  afterAll(async () => {
    await prisma.loginEvent.deleteMany({ where: { email: { in: emails } } });
  });

  async function recordFailures(email: string, count: number) {
    await prisma.loginEvent.createMany({
      data: Array.from({ length: count }, () => ({ email, success: false, reason: "wrong_password" })),
    });
  }

  it("laisse passer un email sans échec récent", async () => {
    const email = `lockout-ok-${crypto.randomUUID()}@example.test`;
    emails.push(email);
    await expect(assertLoginNotLocked(email)).resolves.toBeUndefined();
  });

  it("bloque explicitement après le seuil d'échecs récents", async () => {
    const email = `lockout-blocked-${crypto.randomUUID()}@example.test`;
    emails.push(email);
    await recordFailures(email, 8);
    await expect(assertLoginNotLocked(email)).rejects.toThrow(TooManyRequestsError);
  });

  it("ne compte pas les échecs anciens (hors de la fenêtre glissante)", async () => {
    const email = `lockout-old-${crypto.randomUUID()}@example.test`;
    emails.push(email);
    await prisma.loginEvent.createMany({
      data: Array.from({ length: 8 }, () => ({
        email,
        success: false,
        reason: "wrong_password",
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      })),
    });
    await expect(assertLoginNotLocked(email)).resolves.toBeUndefined();
  });

  it("isole le verrouillage par email — un autre compte n'est jamais affecté", async () => {
    const lockedEmail = `lockout-cross-a-${crypto.randomUUID()}@example.test`;
    const otherEmail = `lockout-cross-b-${crypto.randomUUID()}@example.test`;
    emails.push(lockedEmail, otherEmail);
    await recordFailures(lockedEmail, 8);

    await expect(assertLoginNotLocked(lockedEmail)).rejects.toThrow(TooManyRequestsError);
    await expect(assertLoginNotLocked(otherEmail)).resolves.toBeUndefined();
  });
});
