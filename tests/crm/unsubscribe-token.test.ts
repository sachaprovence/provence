import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from "@/lib/unsubscribe-token";

/**
 * Jeton de désinscription public (v0.10, AR-0158) — jusqu'ici sans aucun
 * test alors qu'il protège une route publique non authentifiée
 * (`/unsubscribe/[token]`) : un jeton falsifié ou pour un autre prospect
 * ne doit jamais désinscrire le mauvais lead (comparaison à temps
 * constant via `crypto.timingSafeEqual`).
 */
describe("createUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("un jeton généré pour un lead se vérifie et renvoie ce même leadId", () => {
    const token = createUnsubscribeToken("lead-123");
    expect(verifyUnsubscribeToken(token)).toBe("lead-123");
  });

  it("un jeton falsifié (mauvais HMAC) est rejeté", () => {
    const token = createUnsubscribeToken("lead-123");
    const [leadId] = token.split(".");
    expect(verifyUnsubscribeToken(`${leadId}.0000000000000000000000000000000f`)).toBeNull();
  });

  it("un jeton dont le leadId a été substitué (HMAC d'un autre lead) est rejeté", () => {
    const tokenForA = createUnsubscribeToken("lead-a");
    const [, hmacForA] = tokenForA.split(".");
    const spoofed = `lead-b.${hmacForA}`;
    expect(verifyUnsubscribeToken(spoofed)).toBeNull();
  });

  it("un jeton malformé (sans point, ou vide) est rejeté sans lever d'exception", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("sans-point")).toBeNull();
    expect(verifyUnsubscribeToken(".")).toBeNull();
  });

  it("deux leads distincts produisent des jetons distincts", () => {
    expect(createUnsubscribeToken("lead-a")).not.toBe(createUnsubscribeToken("lead-b"));
  });

  it("unsubscribeUrl construit une URL contenant un jeton vérifiable pour ce lead", () => {
    const url = unsubscribeUrl("lead-xyz");
    const token = url.split("/unsubscribe/")[1];
    expect(verifyUnsubscribeToken(token)).toBe("lead-xyz");
  });
});
