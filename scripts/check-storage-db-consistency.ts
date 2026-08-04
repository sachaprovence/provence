import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { requireS3BackupConfig, listAllObjects } from "./lib/s3-backup-client";

/**
 * Vérification de cohérence base de données ↔ objets de stockage (v1.2,
 * AR-0166) — en LECTURE SEULE des deux côtés (jamais de suppression,
 * jamais d'écriture) : détecte deux anomalies distinctes.
 *
 * 1. "référence rompue" (grave) : `Attachment.storageKey` pointe vers un
 *    objet qui n'existe plus dans le stockage — fichier perdu, la pièce
 *    jointe est cassée pour l'utilisateur. Fait échouer le script (code 1).
 * 2. "orphelin" (informatif) : un objet existe dans le stockage mais
 *    aucune ligne `Attachment` ne le référence — upload interrompu avant
 *    la création de la ligne, ou pièce jointe supprimée avant AR-0164 (pas
 *    de nettoyage physique avant cette version, voir ADR 0045). Signalé
 *    mais ne fait PAS échouer le script — un futur job de nettoyage
 *    pourra s'appuyer sur ce rapport, jamais ce script lui-même (qui reste
 *    volontairement en lecture seule).
 *
 * Usage : `npx tsx scripts/check-storage-db-consistency.ts`
 * Code de sortie : 0 = cohérent, 1 = au moins une référence rompue trouvée.
 */

function demoStorageKeys(): Set<string> {
  const root = path.join(process.cwd(), "storage-demo");
  const keys = new Set<string>();
  if (!fs.existsSync(root)) return keys;

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(entryPath, key);
      else keys.add(key);
    }
  }
  walk(root, "");
  return keys;
}

async function main() {
  try {
    console.log("→ Lecture des pièces jointes avec clé de stockage (Attachment.storageKey)...");
    const attachments = await prisma.attachment.findMany({
      where: { storageKey: { not: null } },
      select: { id: true, storageKey: true, fileName: true },
    });
    const referencedKeys = new Map<string, { id: string; fileName: string }>();
    for (const attachment of attachments) {
      if (attachment.storageKey) referencedKeys.set(attachment.storageKey, { id: attachment.id, fileName: attachment.fileName });
    }
    console.log(`  ${referencedKeys.size} pièce(s) jointe(s) référencent une clé de stockage.`);

    const storageProvider = process.env.STORAGE_PROVIDER || "demo";
    let actualKeys: Set<string>;
    if (storageProvider === "s3") {
      console.log(`\n→ Listage des objets du bucket S3 configuré...`);
      const config = requireS3BackupConfig();
      const objects = await listAllObjects(config);
      actualKeys = new Set(objects.map((o) => o.key));
      console.log(`  ${actualKeys.size} objet(s) trouvé(s) dans le bucket "${config.bucket}".`);
    } else {
      console.log(`\n→ Parcours du stockage démo local (storage-demo/)...`);
      actualKeys = demoStorageKeys();
      console.log(`  ${actualKeys.size} fichier(s) trouvé(s).`);
    }

    const brokenReferences: { id: string; fileName: string; storageKey: string }[] = [];
    for (const [key, attachment] of referencedKeys) {
      if (!actualKeys.has(key)) brokenReferences.push({ ...attachment, storageKey: key });
    }

    const orphanedObjects: string[] = [];
    for (const key of actualKeys) {
      if (!referencedKeys.has(key)) orphanedObjects.push(key);
    }

    console.log("\n--- Rapport de cohérence ---");
    if (brokenReferences.length === 0) {
      console.log("✅ Aucune référence rompue : chaque Attachment.storageKey correspond à un objet réellement présent dans le stockage.");
    } else {
      console.log(`❌ ${brokenReferences.length} référence(s) rompue(s) (fichier perdu) :`);
      for (const ref of brokenReferences) {
        console.log(`   - Attachment ${ref.id} ("${ref.fileName}") → clé absente du stockage : ${ref.storageKey}`);
      }
    }

    if (orphanedObjects.length === 0) {
      console.log("✅ Aucun objet orphelin (tous les objets du stockage sont référencés par une pièce jointe).");
    } else {
      console.log(`ℹ️  ${orphanedObjects.length} objet(s) orphelin(s) (informatif, non bloquant) :`);
      for (const key of orphanedObjects.slice(0, 20)) console.log(`   - ${key}`);
      if (orphanedObjects.length > 20) console.log(`   ... et ${orphanedObjects.length - 20} de plus.`);
    }

    if (brokenReferences.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
