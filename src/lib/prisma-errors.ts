import { Prisma } from "@/generated/prisma/client";

/** Vrai si l'erreur est une violation de contrainte d'unicité Prisma (code P2002). */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
