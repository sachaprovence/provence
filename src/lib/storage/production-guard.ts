/**
 * Garde-fou de démarrage (v1.2, AR-0164) — pas de validation Zod
 * bloquante (contrairement à `AUTH_SECRET`, voir `env.ts`) : le stockage
 * démo reste un choix opérateur valide (environnement de développement,
 * démonstration commerciale), donc ce contrôle n'empêche jamais le
 * serveur de démarrer. Il rend le risque VISIBLE plutôt que silencieux :
 * en production avec le stockage démo, toute pièce jointe uploadée est
 * écrite sur le système de fichiers local du conteneur, perdue au
 * prochain redéploiement/redémarrage (voir `.env.example` et
 * `docs/adr/0045`).
 */
export function isProductionWithDemoStorage(nodeEnv: string, storageProvider: string): boolean {
  return nodeEnv === "production" && storageProvider !== "s3";
}

export const PRODUCTION_DEMO_STORAGE_WARNING =
  "STORAGE_PROVIDER=demo en production : les pièces jointes uploadées sont " +
  "écrites sur le disque local du conteneur et SERONT PERDUES au prochain " +
  "redéploiement/redémarrage (aucune persistance, aucun partage entre " +
  "instances). Définir STORAGE_PROVIDER=s3 (+ STORAGE_S3_BUCKET/REGION/" +
  "ACCESS_KEY_ID/SECRET_ACCESS_KEY) avant tout usage réel en production.";
