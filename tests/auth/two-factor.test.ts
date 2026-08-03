import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  base32Encode,
  buildOtpAuthUrl,
  confirmTwoFactorEnrollment,
  disableTwoFactor,
  generateTwoFactorSecret,
  startTwoFactorEnrollment,
  totpCode,
  verifyTotpCode,
} from "@/lib/two-factor";
import { ValidationError } from "@/lib/errors";

/**
 * Préparation 2FA (v0.10, AR-0058) — le schéma (`User.twoFactorSecret`/
 * `twoFactorEnabled`) et l'interface (`src/lib/two-factor.ts`) existent
 * pour poser les fondations de `MOD-17` (post-v1.0), sans encore rendre le
 * 2FA obligatoire à la connexion. Vérifie : (1) l'implémentation TOTP
 * (RFC 6238) produit les codes officiels du vecteur de test RFC 4226
 * Annexe D ; (2) la tolérance de dérive d'horloge ; (3) le cycle complet
 * inscription → confirmation → désactivation sur un utilisateur réel, sans
 * jamais activer le 2FA pour un utilisateur qui ne l'a pas explicitement
 * confirmé par un code valide.
 */
describe("TOTP — vecteur de test officiel RFC 4226 Annexe D", () => {
  // Secret ASCII "12345678901234567890" (20 octets), encodé en base32 pour
  // notre implémentation — mêmes valeurs HOTP publiées par la RFC, tronquées
  // sur 6 chiffres (nous utilisons TOTP_DIGITS=6, la RFC illustre en 8).
  const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
  const expectedByCounter = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

  it.each(expectedByCounter.map((code, counter) => [counter, code] as const))(
    "compteur %i produit le code officiel %s",
    (counter, expectedCode) => {
      expect(totpCode(secret, counter * 30_000)).toBe(expectedCode);
    }
  );
});

describe("verifyTotpCode", () => {
  it("accepte le code du pas courant et refuse un code incorrect", () => {
    const secret = generateTwoFactorSecret();
    const now = Date.now();
    const code = totpCode(secret, now);

    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, "000000" === code ? "111111" : "000000", now)).toBe(false);
  });

  it("tolère un décalage d'horloge d'un pas (30s) mais pas deux", () => {
    const secret = generateTwoFactorSecret();
    const now = Date.now();
    const codeOneStepAgo = totpCode(secret, now - 30_000);
    const codeTwoStepsAgo = totpCode(secret, now - 60_000);

    expect(verifyTotpCode(secret, codeOneStepAgo, now)).toBe(true);
    expect(verifyTotpCode(secret, codeTwoStepsAgo, now)).toBe(false);
  });
});

describe("buildOtpAuthUrl", () => {
  it("produit une URI otpauth:// standard exploitable par une application d'authentification", () => {
    const url = buildOtpAuthUrl("JBSWY3DPEHPK3PXP", "user@example.test", "Autorun");
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=Autorun");
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Cycle d'inscription 2FA — startTwoFactorEnrollment / confirmTwoFactorEnrollment / disableTwoFactor", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(suffix: string) {
    const user = await prisma.user.create({
      data: { email: `2fa-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "2FA" },
    });
    userIds.push(user.id);
    return user;
  }

  it("l'inscription ne rend pas le 2FA actif tant que le code n'est pas confirmé", async () => {
    const user = await createUser("pending");
    const { secret, otpauthUrl } = await startTwoFactorEnrollment(user.id);

    expect(otpauthUrl).toContain(encodeURIComponent(`Autorun:${user.email}`));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorSecret).toBe(secret);
    expect(row.twoFactorEnabled).toBe(false);
  });

  it("confirmTwoFactorEnrollment active le 2FA avec un code valide", async () => {
    const user = await createUser("confirm");
    const { secret } = await startTwoFactorEnrollment(user.id);
    const validCode = totpCode(secret);

    await confirmTwoFactorEnrollment(user.id, validCode);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorEnabled).toBe(true);
  });

  it("confirmTwoFactorEnrollment rejette explicitement un code invalide, sans activer le 2FA", async () => {
    const user = await createUser("wrong-code");
    await startTwoFactorEnrollment(user.id);

    await expect(confirmTwoFactorEnrollment(user.id, "000000")).rejects.toThrow(ValidationError);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorEnabled).toBe(false);
  });

  it("confirmTwoFactorEnrollment échoue explicitement sans inscription en cours", async () => {
    const user = await createUser("no-enrollment");
    await expect(confirmTwoFactorEnrollment(user.id, "123456")).rejects.toThrow(/Aucune inscription/);
  });

  it("disableTwoFactor efface le secret et désactive le 2FA", async () => {
    const user = await createUser("disable");
    const { secret } = await startTwoFactorEnrollment(user.id);
    await confirmTwoFactorEnrollment(user.id, totpCode(secret));

    await disableTwoFactor(user.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.twoFactorSecret).toBeNull();
  });

  it("isolation : le secret d'un utilisateur n'affecte jamais la vérification d'un autre", async () => {
    const userA = await createUser("tenant-a");
    const userB = await createUser("tenant-b");
    const { secret: secretA } = await startTwoFactorEnrollment(userA.id);
    await startTwoFactorEnrollment(userB.id);

    const codeForA = totpCode(secretA);
    await expect(confirmTwoFactorEnrollment(userB.id, codeForA)).rejects.toThrow(ValidationError);
  });
});
