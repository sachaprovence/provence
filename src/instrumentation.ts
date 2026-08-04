import type { Instrumentation } from "next";

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
        {
          nodeEnv: env.NODE_ENV,
          aiProvider: env.AI_PROVIDER,
          emailProvider: env.EMAIL_PROVIDER,
          storageProvider: env.STORAGE_PROVIDER,
        },
        "Configuration d'environnement validée."
      );

      // Alerte critique (jamais bloquante, voir production-guard.ts) : un
      // stockage démo en production perd silencieusement les pièces
      // jointes à chaque redéploiement si personne ne le remarque.
      const { isProductionWithDemoStorage, PRODUCTION_DEMO_STORAGE_WARNING } = await import("@/lib/storage/production-guard");
      if (isProductionWithDemoStorage(env.NODE_ENV, env.STORAGE_PROVIDER)) {
        logger.error({ storageProvider: env.STORAGE_PROVIDER }, PRODUCTION_DEMO_STORAGE_WARNING);
      }
    } catch (error) {
      logger.error({ err: error }, "Configuration d'environnement invalide — arrêt du serveur.");
      throw error;
    }

    // Enregistre les runtimes/outils du Framework Agents (en mémoire, voir
    // src/lib/agents/registry.ts) et synchronise le catalogue en base
    // (idempotent) — au démarrage plutôt qu'au premier import, pour que le
    // catalogue soit toujours disponible même sans avoir lancé le seed de
    // démonstration.
    try {
      const { registerBuiltInAgentComponents, syncAgentCatalog } = await import("@/lib/agents/bootstrap");
      registerBuiltInAgentComponents();
      await syncAgentCatalog();
      logger.info("Catalogue du Framework Agents synchronisé.");
    } catch (error) {
      logger.error({ err: error }, "Échec de l'initialisation du Framework Agents.");
    }

    // Enregistre les registres du Workflow Engine (déclencheurs, actions) et
    // seed les templates (idempotent) — voir src/lib/workflows/bootstrap.ts.
    try {
      const { syncWorkflowCatalog } = await import("@/lib/workflows/bootstrap");
      await syncWorkflowCatalog();
      logger.info("Catalogue du Workflow Engine synchronisé.");
    } catch (error) {
      logger.error({ err: error }, "Échec de l'initialisation du Workflow Engine.");
    }

    // Enregistre les registres de l'Automation Engine (déclencheurs, jobs) et
    // seed les automatisations métier prêtes à l'emploi (idempotent) — voir
    // src/lib/automation/bootstrap.ts.
    try {
      const { syncAutomationCatalog } = await import("@/lib/automation/bootstrap");
      await syncAutomationCatalog();
      logger.info("Catalogue de l'Automation Engine synchronisé.");
    } catch (error) {
      logger.error({ err: error }, "Échec de l'initialisation de l'Automation Engine.");
    }
  }
}

/**
 * Filet de sécurité pour les erreurs que `toApiErrorResponse` ne voit
 * JAMAIS (v1.3, AR-0173) : celles levées pendant le rendu d'un Server
 * Component, une Server Action, ou par le Proxy lui-même — en dehors de
 * tout `try/catch` applicatif, elles n'atteignaient jusqu'ici ni le journal
 * structuré (`logger`) ni Sentry (`captureExceptionBestEffort`, AR-0048),
 * seulement la sortie console brute de Next.js. `onRequestError` est le
 * seul point d'entrée officiel de Next.js pour ce cas — voir la doc
 * `node_modules/next/dist/docs/.../instrumentation.md`.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger } = await import("@/lib/logger");
  const { captureExceptionBestEffort } = await import("@/lib/observability/error-tracking");

  const errorContext = {
    route: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    requestId: Array.isArray(request.headers["x-request-id"]) ? request.headers["x-request-id"][0] : request.headers["x-request-id"],
  };

  logger.error({ err: error, ...errorContext }, "Erreur non interceptée par un gestionnaire applicatif (rendu/action/proxy).");
  captureExceptionBestEffort(error, errorContext);
};
