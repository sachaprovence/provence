import "dotenv/config";
import { spawnSync } from "node:child_process";
import { prisma } from "@/lib/prisma";

/**
 * Une seule commande pour démarrer l'ensemble du projet en local (v1.6,
 * mission "INSTALLATION") : applique les migrations, seed les données de
 * démonstration UNIQUEMENT si la base est vide (`prisma/seed.ts` n'est pas
 * idempotent — des `create()` simples, pas des `upsert` — le rejouer sur
 * une base déjà seedée échouerait sur des emails déjà pris), puis lance le
 * serveur de développement. Suppose PostgreSQL déjà accessible via
 * `DATABASE_URL` (voir README.md#installation-locale-sans-docker) —
 * aucune tentative de démarrer Postgres lui-même, hors périmètre de ce
 * script.
 */

function run(command: string, args: string[], label: string) {
  console.log(`\n→ ${label}…`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`\n✗ Échec : ${label}.`);
    process.exit(result.status ?? 1);
  }
}

async function isDatabaseEmpty(): Promise<boolean> {
  const userCount = await prisma.user.count();
  return userCount === 0;
}

async function main() {
  run("npx", ["prisma", "migrate", "deploy"], "Application des migrations");
  run("npx", ["prisma", "generate"], "Génération du client Prisma");

  if (await isDatabaseEmpty()) {
    run("npm", ["run", "db:seed"], "Chargement des données de démonstration (base vide)");
  } else {
    console.log("\n→ Base déjà initialisée — données de démonstration non rechargées.");
  }

  console.log("\n✓ Prêt. Comptes de démonstration (mot de passe demo12345) :");
  console.log("  Administrateur : admin@demo.provence360.fr");
  console.log("  Commercial     : commercial@demo.provence360.fr");
  console.log("  Prestataire    : prestataire@demo.provence360.fr");
  console.log("\n→ Démarrage du serveur de développement sur http://localhost:3000 …\n");

  const dev = spawnSync("npx", ["next", "dev"], { stdio: "inherit", shell: process.platform === "win32" });
  process.exit(dev.status ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
