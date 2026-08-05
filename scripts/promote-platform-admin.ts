import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * Promotion d'un utilisateur en administrateur PLATEFORME (v1.4, AR-0185) —
 * `User.isPlatformAdmin` n'est JAMAIS posé par l'application elle-même (ni
 * API, ni UI) : seule cette opération manuelle, exécutée par un opérateur
 * de confiance, peut l'activer. Même principe que les autres scripts
 * d'administration one-off de ce dépôt (`scripts/prune-old-backups.ts`,
 * `scripts/backup-metrics-report.ts`).
 *
 * Usage :
 *   npx tsx scripts/promote-platform-admin.ts <email> [--revoke]
 */
async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Usage: npx tsx scripts/promote-platform-admin.ts <email> [--revoke]");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Aucun utilisateur avec l'email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: !revoke } });
  console.log(
    revoke
      ? `✅ "${email}" n'est plus administrateur plateforme.`
      : `✅ "${email}" est maintenant administrateur plateforme (isPlatformAdmin=${updated.isPlatformAdmin}).`
  );
}

main();
