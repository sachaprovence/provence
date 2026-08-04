import "server-only";
import { ValidationError } from "@/lib/errors";

/**
 * Garde-fou partagé (v1.2, AR-0164) : toute clé de stockage a pour
 * convention `${organizationId}/<reste>` — utilisé par `demo-provider.ts`,
 * `providers/s3.ts` et `GET /api/storage/demo/[...path]` pour appliquer
 * IDENTIQUEMENT l'isolation par organisation et le rejet de la traversée de
 * répertoire, plutôt que de dupliquer cette logique à trois endroits (et
 * risquer qu'un seul soit mis à jour lors d'un futur changement).
 */
export function assertKeyBelongsToOrganization(key: string, organizationId: string): void {
  const segments = key.split("/");
  if (segments.length < 2 || segments[0] !== organizationId) {
    throw new ValidationError("Cette ressource n'appartient pas à cette organisation.");
  }
  if (segments.some((segment) => segment === "" || segment === ".." || segment === ".")) {
    throw new ValidationError("Clé de stockage invalide.");
  }
}
