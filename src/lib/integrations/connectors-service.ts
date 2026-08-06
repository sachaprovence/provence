import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { ValidationError, NotFoundError, TooManyRequestsError } from "@/lib/errors";
import { isRateLimited } from "@/lib/security/rate-limiter";
import { assertConnectorLimitAvailable } from "@/lib/billing/quota-enforcement";
import { getStripeConfigState, testStripeConnection } from "@/lib/diagnostics/providers/stripe-diagnostic";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Écran Connecteurs unifié (v1.6, ADR 0049) : Gmail et Google Calendar
 * existaient déjà (boutons de connexion OAuth dans `/settings`, inchangés)
 * — cette page les rassemble avec deux connecteurs à base de webhook
 * entrant, plus simples qu'une intégration OAuth complète et suffisants
 * pour Slack/Discord : coller l'URL de webhook fournie par le service,
 * testable par un envoi réel (best-effort). Stripe reste une configuration
 * de DÉPLOIEMENT (variable d'environnement, jamais par organisation — voir
 * `src/lib/billing/index.ts` et le diagnostic v1.2 réutilisé tel quel) :
 * affiché en lecture seule, jamais un faux bouton "connecter" qui
 * n'agirait sur rien.
 */

export type WebhookConnectorKind = "SLACK" | "DISCORD";

const WEBHOOK_CONNECTOR_LABEL: Record<WebhookConnectorKind, string> = {
  SLACK: "Slack",
  DISCORD: "Discord",
};

function assertValidWebhookUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("URL de webhook invalide.");
  }
  if (parsed.protocol !== "https:") {
    throw new ValidationError("L'URL de webhook doit utiliser https.");
  }
}

export async function getWebhookConnector(actor: WorkspaceActor, kind: WebhookConnectorKind) {
  return prisma.integration.findFirst({ where: { organizationId: actor.organization.id, kind } });
}

export async function connectWebhookIntegration(actor: WorkspaceActor, kind: WebhookConnectorKind, webhookUrl: string) {
  assertValidWebhookUrl(webhookUrl);

  const existing = await prisma.integration.findFirst({ where: { organizationId: actor.organization.id, kind } });
  let integration;
  if (existing) {
    integration = await prisma.integration.update({
      where: { id: existing.id },
      data: { status: "CONNECTED", config: { webhookUrl } as never },
    });
  } else {
    await assertConnectorLimitAvailable(actor.organization.id, kind);
    integration = await prisma.integration.create({
      data: {
        organizationId: actor.organization.id,
        kind,
        name: WEBHOOK_CONNECTOR_LABEL[kind],
        status: "CONNECTED",
        config: { webhookUrl } as never,
      },
    });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "connector.connected",
    entityType: "Integration",
    entityId: integration.id,
    metadata: { kind },
  });

  return integration;
}

export async function disconnectWebhookIntegration(actor: WorkspaceActor, kind: WebhookConnectorKind) {
  const existing = await prisma.integration.findFirst({ where: { organizationId: actor.organization.id, kind } });
  if (!existing) throw new NotFoundError("Connecteur introuvable.");

  const integration = await prisma.integration.update({
    where: { id: existing.id },
    data: { status: "DISCONNECTED", config: {} as never },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "connector.disconnected",
    entityType: "Integration",
    entityId: integration.id,
    metadata: { kind },
  });

  return integration;
}

const MAX_TESTS_PER_WINDOW = 5;
const TEST_WINDOW_MS = 5 * 60_000;

/** Test best-effort — un envoi réel minimal, jamais un message métier réel. Limité (5/5min/organisation/connecteur), même convention que les diagnostics v1.2. */
export async function testWebhookIntegration(actor: WorkspaceActor, kind: WebhookConnectorKind) {
  if (isRateLimited(`connector-test:${actor.organization.id}:${kind}`, MAX_TESTS_PER_WINDOW, TEST_WINDOW_MS)) {
    throw new TooManyRequestsError(
      `Trop de tests de connexion pour ce connecteur (limite : ${MAX_TESTS_PER_WINDOW} tests / 5 minutes). Réessayez dans quelques minutes.`
    );
  }

  const existing = await prisma.integration.findFirst({ where: { organizationId: actor.organization.id, kind } });
  if (!existing) throw new NotFoundError("Connecteur introuvable.");
  const config = (existing.config as { webhookUrl?: string } | null) ?? {};
  if (!config.webhookUrl) throw new ValidationError("Aucune URL de webhook configurée.");

  const body =
    kind === "SLACK"
      ? { text: "Test de connexion Autorun — ce message confirme que le webhook fonctionne." }
      : { content: "Test de connexion Autorun — ce message confirme que le webhook fonctionne." };

  let status: "CONNECTED" | "ERROR" = "ERROR";
  let message: string;
  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      status = "CONNECTED";
      message = "Message de test envoyé avec succès.";
    } else {
      message = `Le service a répondu ${response.status}.`;
    }
  } catch {
    message = "Webhook injoignable (erreur réseau ou délai dépassé).";
  }

  await prisma.integration.update({ where: { id: existing.id }, data: { status } });
  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "connector.tested",
    entityType: "Integration",
    entityId: existing.id,
    metadata: { kind, success: status === "CONNECTED" },
  });

  return { status, message };
}

export async function getUnifiedConnectorsView(actor: WorkspaceActor) {
  const integrations = await prisma.integration.findMany({
    where: { organizationId: actor.organization.id, kind: { in: ["EMAIL", "CALENDAR", "SLACK", "DISCORD"] } },
  });
  const emailIntegration = integrations.find((i) => i.kind === "EMAIL");
  const emailProvider = (emailIntegration?.config as { provider?: string } | null)?.provider || process.env.EMAIL_PROVIDER || "demo";
  const calendarIntegration = integrations.find((i) => i.kind === "CALENDAR");
  const slackIntegration = integrations.find((i) => i.kind === "SLACK");
  const discordIntegration = integrations.find((i) => i.kind === "DISCORD");

  const stripeConfigState = await getStripeConfigState();

  return {
    gmail: { status: emailIntegration?.status ?? "DEMO", emailProvider },
    calendar: { status: calendarIntegration?.status ?? "DISCONNECTED" },
    slack: { status: slackIntegration?.status ?? "DISCONNECTED", webhookConfigured: Boolean((slackIntegration?.config as { webhookUrl?: string } | null)?.webhookUrl) },
    discord: {
      status: discordIntegration?.status ?? "DISCONNECTED",
      webhookConfigured: Boolean((discordIntegration?.config as { webhookUrl?: string } | null)?.webhookUrl),
    },
    stripe: { configState: stripeConfigState },
  };
}

export async function testStripe() {
  return testStripeConnection();
}
