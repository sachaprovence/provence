import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as requestReset } from "@/app/api/auth/reset-password/request/route";

/**
 * Correction critique (v0.10, AR-0153) — `POST /api/auth/reset-password/request`
 * renvoyait auparavant `demoResetLink` en clair dans la réponse JSON dans
 * TOUS les environnements, y compris avec un vrai fournisseur email
 * configuré, sans jamais envoyer le moindre email réel (prise de contrôle
 * de compte triviale). Vérifie : (1) mode démo inchangé (lien renvoyé,
 * comportement historique) ; (2) fournisseur réel configuré → email
 * réellement envoyé (vrai serveur HTTP local) et AUCUN lien dans la
 * réponse ; (3) non-révélation d'existence de compte dans les deux modes.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function requestFor(email: string) {
  return new Request("http://localhost/api/auth/reset-password/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

runIfDatabase("POST /api/auth/reset-password/request", () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const originalEmailProvider = process.env.EMAIL_PROVIDER;

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (originalEmailProvider) process.env.EMAIL_PROVIDER = originalEmailProvider;
    else delete process.env.EMAIL_PROVIDER;
  });

  afterEach(() => {
    if (originalEmailProvider) process.env.EMAIL_PROVIDER = originalEmailProvider;
    else delete process.env.EMAIL_PROVIDER;
  });

  async function createUserWithOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org reset ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: {
        email: `reset-${suffix}-${crypto.randomUUID()}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Test",
        lastName: "Reset",
      },
    });
    userIds.push(user.id);
    await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER_ADMIN" } });
    return { organization, user };
  }

  it("mode démo (comportement historique) : renvoie le lien directement dans la réponse", async () => {
    delete process.env.EMAIL_PROVIDER;
    const { user } = await createUserWithOrg("demo");

    const response = await requestReset(requestFor(user.email));
    const body = (await response.json()) as { ok: boolean; demoResetLink?: string };

    expect(body.ok).toBe(true);
    expect(body.demoResetLink).toMatch(/^\/reset-password\//);

    const token = body.demoResetLink!.split("/").pop()!;
    const stored = await prisma.passwordResetToken.findUnique({ where: { token } });
    expect(stored?.userId).toBe(user.id);
  });

  it("fournisseur réel configuré : envoie réellement l'email et ne renvoie JAMAIS le lien dans la réponse", async () => {
    const requestsReceived: { body: string; headers: http.IncomingHttpHeaders }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requestsReceived.push({ body, headers: req.headers });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "resend-msg-reset-1" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    try {
      process.env.EMAIL_PROVIDER = "resend";
      const { organization, user } = await createUserWithOrg("real");
      await prisma.integration.create({
        data: { organizationId: organization.id, kind: "EMAIL", name: "Resend", status: "CONNECTED", config: { apiKey: "re_test_key", baseUrl } as never },
      });

      const response = await requestReset(requestFor(user.email));
      const body = (await response.json()) as { ok: boolean; demoResetLink?: string };

      expect(body.ok).toBe(true);
      expect(body.demoResetLink).toBeUndefined();
      expect(requestsReceived).toHaveLength(1);
      expect(JSON.parse(requestsReceived[0].body).to).toEqual([user.email]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("ne révèle jamais si un compte existe (email inconnu) — comportement identique avec un fournisseur réel configuré", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    const response = await requestReset(requestFor(`unknown-${crypto.randomUUID()}@example.test`));
    const body = (await response.json()) as { ok: boolean; demoResetLink?: string };
    expect(body.ok).toBe(true);
    expect(body.demoResetLink).toBeUndefined();
  });
});
