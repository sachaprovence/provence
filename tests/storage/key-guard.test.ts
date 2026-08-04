import { describe, expect, it } from "vitest";
import { assertKeyBelongsToOrganization } from "@/lib/storage/key-guard";
import { ValidationError } from "@/lib/errors";

describe("assertKeyBelongsToOrganization (AR-0164)", () => {
  it("accepte une clé correctement préfixée par l'organisation", () => {
    expect(() => assertKeyBelongsToOrganization("org-1/uuid-photo.jpg", "org-1")).not.toThrow();
  });

  it("refuse une clé préfixée par une autre organisation", () => {
    expect(() => assertKeyBelongsToOrganization("org-2/uuid-photo.jpg", "org-1")).toThrow(ValidationError);
  });

  it("refuse une clé sans segment de nom de fichier (organisation seule)", () => {
    expect(() => assertKeyBelongsToOrganization("org-1", "org-1")).toThrow(ValidationError);
  });

  it("refuse une traversée de répertoire explicite (..)", () => {
    expect(() => assertKeyBelongsToOrganization("org-1/../org-2/secret.pdf", "org-1")).toThrow(ValidationError);
  });

  it("refuse un segment courant explicite (.)", () => {
    expect(() => assertKeyBelongsToOrganization("org-1/./secret.pdf", "org-1")).toThrow(ValidationError);
  });

  it("refuse un segment vide (double slash)", () => {
    expect(() => assertKeyBelongsToOrganization("org-1//secret.pdf", "org-1")).toThrow(ValidationError);
  });
});
