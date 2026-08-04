import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

/**
 * Préparation 2FA par utilisateur (v0.10, AR-0058) — TOTP (RFC 6238, HMAC-
 * SHA1, RFC 4226) implémenté sans dépendance externe (aucune bibliothèque
 * TOTP n'était déjà présente dans le projet). Pose les fondations pour
 * `MOD-17` (post-v1.0) : le schéma et l'interface existent, mais rien
 * n'impose encore le 2FA à la connexion — voir `src/lib/auth.ts`, qui ne
 * consulte pas `twoFactorEnabled`.
 */
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTwoFactorSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

export function totpCode(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);
  return hotp(secret, counter);
}

/** Tolère un décalage d'horloge de `TOTP_WINDOW` pas (30s) de part et d'autre du pas courant. */
export function verifyTotpCode(secret: string, code: string, at: number = Date.now()): boolean {
  const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    if (hotp(secret, counter + delta) === code) return true;
  }
  return false;
}

/** URI `otpauth://` standard, exploitable par toute application d'authentification (Google Authenticator, etc.) pour générer un QR code côté UI. */
export function buildOtpAuthUrl(secret: string, accountEmail: string, issuer = "Autorun"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Démarre (ou redémarre) l'inscription 2FA : génère un nouveau secret, non encore actif tant que `confirmTwoFactorEnrollment` n'a pas vérifié un code. */
export async function startTwoFactorEnrollment(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateTwoFactorSecret();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
  return { secret, otpauthUrl: buildOtpAuthUrl(secret, user.email) };
}

/** Confirme l'inscription en vérifiant un code TOTP réel — active le 2FA seulement si le code correspond. */
export async function confirmTwoFactorEnrollment(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) {
    throw new ValidationError("Aucune inscription 2FA en cours pour cet utilisateur.");
  }
  if (!verifyTotpCode(user.twoFactorSecret, code)) {
    throw new ValidationError("Code de vérification invalide.");
  }
  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
}

export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: null, twoFactorEnabled: false } });
}
