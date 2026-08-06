"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

type ConnectorsView = {
  gmail: { status: string; emailProvider: string };
  calendar: { status: string };
  slack: { status: string; webhookConfigured: boolean };
  discord: { status: string; webhookConfigured: boolean };
  stripe: { configState: string };
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  CONNECTED: "success",
  CONFIGURED: "success",
  DEMO: "neutral",
  PARTIALLY_CONFIGURED: "warning",
  DISCONNECTED: "neutral",
  NOT_CONFIGURED: "neutral",
  ERROR: "danger",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

function WebhookConnectorCard({
  kind,
  label,
  status,
  webhookConfigured,
  canManage,
  onChange,
}: {
  kind: "SLACK" | "DISCORD";
  label: string;
  status: string;
  webhookConfigured: boolean;
  canManage: boolean;
  onChange: () => void;
}) {
  const { push } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      await apiPost(`/api/integrations/connectors/${kind}/connect`, { webhookUrl });
      push({ title: `${label} connecté`, variant: "success" });
      setWebhookUrl("");
      onChange();
    } catch (err) {
      push({
        title: "Connexion impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      const res = await apiPost<{ status: string; message: string }>(`/api/integrations/connectors/${kind}/test`, {});
      push({ title: res.message, variant: res.status === "CONNECTED" ? "success" : "error" });
      onChange();
    } catch (err) {
      push({
        title: "Test impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await apiPost(`/api/integrations/connectors/${kind}/disconnect`, {});
      push({ title: `${label} déconnecté`, variant: "success" });
      onChange();
    } catch {
      push({ title: "Déconnexion impossible", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{label}</CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      {canManage ? (
        <div className="space-y-3">
          {!webhookConfigured ? (
            <>
              <Input
                label="URL du webhook entrant"
                placeholder={kind === "SLACK" ? "https://hooks.slack.com/services/…" : "https://discord.com/api/webhooks/…"}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Button onClick={handleConnect} loading={busy} disabled={!webhookUrl}>
                Connecter {label}
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleTest} loading={busy}>
                Tester la connexion
              </Button>
              <Button variant="danger" onClick={handleDisconnect} loading={busy}>
                Déconnecter
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-p360-muted">Seul un administrateur peut configurer ce connecteur.</p>
      )}
    </Card>
  );
}

export function ConnectorsClient({ initialView, canManage }: { initialView: ConnectorsView; canManage: boolean }) {
  const [view, setView] = useState(initialView);
  const { push } = useToast();
  const [testingStripe, setTestingStripe] = useState(false);

  async function refresh() {
    const res = await fetch("/api/integrations/connectors").then((r) => r.json());
    setView(res);
  }

  async function handleTestStripe() {
    setTestingStripe(true);
    try {
      const res = await apiPost<{ status: string; message: string }>("/api/integrations/connectors/stripe/test", {});
      push({ title: res.message, variant: res.status === "TEST_SUCCESS" ? "success" : "error" });
    } catch (err) {
      push({
        title: "Test impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setTestingStripe(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Gmail</CardTitle>
          <StatusBadge status={view.gmail.status} />
        </CardHeader>
        {view.gmail.emailProvider === "gmail" ? (
          view.gmail.status !== "CONNECTED" ? (
            <a href="/api/email/gmail/connect" className="btn-secondary inline-block text-sm">
              Connecter Gmail
            </a>
          ) : (
            <p className="text-sm text-p360-muted">Gmail est connecté.</p>
          )
        ) : (
          <p className="text-sm text-p360-muted">
            Choisissez « Gmail » comme fournisseur email dans{" "}
            <a href="/settings" className="underline hover:text-p360-blue">
              Paramètres
            </a>{" "}
            pour activer la connexion.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Google Calendar</CardTitle>
          <StatusBadge status={view.calendar.status} />
        </CardHeader>
        {view.calendar.status !== "CONNECTED" ? (
          <a href="/api/calendar/google/connect" className="btn-secondary inline-block text-sm">
            Connecter Google Calendar
          </a>
        ) : (
          <p className="text-sm text-p360-muted">Google Calendar est connecté.</p>
        )}
      </Card>

      <WebhookConnectorCard
        kind="SLACK"
        label="Slack"
        status={view.slack.status}
        webhookConfigured={view.slack.webhookConfigured}
        canManage={canManage}
        onChange={refresh}
      />
      <WebhookConnectorCard
        kind="DISCORD"
        label="Discord"
        status={view.discord.status}
        webhookConfigured={view.discord.webhookConfigured}
        canManage={canManage}
        onChange={refresh}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stripe</CardTitle>
          <StatusBadge status={view.stripe.configState} />
        </CardHeader>
        <div className="space-y-2">
          <p className="text-sm text-p360-muted">
            Configuration de déploiement (variables d&apos;environnement), pas par organisation — voir{" "}
            <a href="/settings/billing" className="underline hover:text-p360-blue">
              Facturation
            </a>
            .
          </p>
          {canManage && (
            <Button variant="secondary" onClick={handleTestStripe} loading={testingStripe}>
              Tester la connexion
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
