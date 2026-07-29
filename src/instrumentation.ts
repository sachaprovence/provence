/**
 * Exécuté une fois au démarrage d'une instance serveur Next.js (avant que le
 * serveur ne commence à traiter des requêtes) — voir
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation.
 *
 * Sert de point d'entrée unique pour valider la configuration d'environnement
 * au boot ("fail fast") : ne s'exécute jamais pendant `next build`, donc sans
 * risque de bloquer l'étape de build si une variable runtime (ex.
 * AUTH_SECRET côté conteneur de production) n'est pas encore disponible à ce
 * moment-là.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("@/lib/env");
    const { logger } = await import("@/lib/logger");

    try {
      const env = loadEnv();
      logger.info(
        { nodeEnv: env.NODE_ENV, aiProvider: env.AI_PROVIDER, emailProvider: env.EMAIL_PROVIDER },
        "Configuration d'environnement validée."
      );
    } catch (error) {
      logger.error({ err: error }, "Configuration d'environnement invalide — arrêt du serveur.");
      throw error;
    }
  }
}
