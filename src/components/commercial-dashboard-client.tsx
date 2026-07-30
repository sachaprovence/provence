"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/stat-tile";
import { useToast } from "@/components/ui/toast-provider";

type ProspectRow = {
  id: string;
  companyName: string;
  sector: string | null;
  companySize: string | null;
  stage: string;
  score: number | null;
  website: string | null;
  createdAt: string;
};

type PendingActionRow = {
  id: string;
  type: string;
  title: string;
  reasoning: string | null;
  payload: unknown;
  prospectCompanyName: string;
  createdAt: string;
};

type RecentActionRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  prospectCompanyName: string;
  createdAt: string;
};

const STAGE_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  TO_QUALIFY: "À qualifier",
  QUALIFIED: "Qualifié",
  FIRST_CONTACT: "Premier contact",
  FOLLOW_UP: "Relance",
  MEETING: "Rendez-vous",
  QUOTE_SENT: "Devis envoyé",
  NEGOTIATION: "Négociation",
  WON: "Signé",
  LOST: "Perdu",
};

const STAGE_ORDER = [
  "NEW",
  "TO_QUALIFY",
  "QUALIFIED",
  "FIRST_CONTACT",
  "FOLLOW_UP",
  "MEETING",
  "QUOTE_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

const STAGE_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  NEW: "neutral",
  TO_QUALIFY: "neutral",
  QUALIFIED: "info",
  FIRST_CONTACT: "info",
  FOLLOW_UP: "warning",
  MEETING: "info",
  QUOTE_SENT: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

const ACTION_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  SENT: "success",
  DISMISSED: "neutral",
};

const ACTION_TYPE_LABEL: Record<string, string> = {
  EMAIL_DRAFT: "Email",
  FOLLOW_UP: "Relance",
  QUOTE_DRAFT: "Devis",
  PROPOSAL: "Proposition",
  RECOMMENDATION: "Recommandation",
};

export function CommercialDashboardClient({
  installed,
  status,
  byStage,
  prospects,
  pendingActions,
  recentActions,
}: {
  installed: boolean;
  status: string | null;
  byStage: Record<string, number>;
  prospects: ProspectRow[];
  pendingActions: PendingActionRow[];
  recentActions: RecentActionRow[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!installed) {
    return (
      <EmptyState
        title="L'Agent Commercial n'est pas installé"
        description="Installez-le depuis le catalogue d'agents pour commencer à gérer votre pipeline."
        action={
          <Link href="/settings/agents" className="btn-primary">
            Aller au catalogue
          </Link>
        }
      />
    );
  }

  async function handleFullCycle() {
    if (!companyName.trim()) return;
    setSubmitting(true);
    try {
      await apiPost("/api/commercial/requests", {
        action: "full_cycle",
        data: {
          companyName,
          sector: sector || undefined,
          companySize: companySize || undefined,
          website: website || undefined,
        },
      });
      push({ title: "Cycle complet lancé", description: "Prospect qualifié, scoré et email préparé.", variant: "success" });
      setCompanyName("");
      setSector("");
      setCompanySize("");
      setWebsite("");
      router.refresh();
    } catch (err) {
      push({
        title: "Échec du cycle",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReanalyze(prospectId: string) {
    setBusyId(prospectId);
    try {
      await apiPost("/api/commercial/requests", { action: "score_prospect", prospectId });
      router.refresh();
      push({ title: "Nouvelle analyse effectuée", variant: "success" });
    } catch (err) {
      push({
        title: "Analyse impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecision(actionId: string, decision: "approve" | "reject") {
    setBusyId(actionId);
    try {
      await apiPost(`/api/commercial/actions/${actionId}/${decision}`);
      router.refresh();
      push({ title: decision === "approve" ? "Action approuvée" : "Action refusée", variant: "success" });
    } catch (err) {
      push({
        title: "Action impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(actionId: string) {
    setBusyId(actionId);
    try {
      await apiPost(`/api/commercial/actions/${actionId}/send`);
      router.refresh();
      push({ title: "Action marquée comme envoyée", variant: "success" });
    } catch (err) {
      push({
        title: "Envoi impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  const approvedActions = recentActions.filter((a) => a.status === "APPROVED");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant={status === "ACTIVE" ? "success" : "warning"}>{status ?? "?"}</Badge>
        <span className="text-sm text-p360-muted">{prospects.length} prospect(s) géré(s)</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGE_ORDER.map((stage) => (
          <StatTile key={stage} label={STAGE_LABEL[stage]} value={String(byStage[stage] ?? 0)} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau prospect (cycle complet)</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Nom de l'entreprise *" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <input className="input" placeholder="Secteur" value={sector} onChange={(e) => setSector(e.target.value)} />
          <input className="input" placeholder="Taille (ex. 10-49)" value={companySize} onChange={(e) => setCompanySize(e.target.value)} />
          <input className="input" placeholder="Site web" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div className="mt-3">
          <Button variant="primary" loading={submitting} disabled={!companyName.trim()} onClick={handleFullCycle}>
            Lancer le cycle complet
          </Button>
          <p className="mt-2 text-xs text-p360-muted">
            Qualification, scoring, estimation du potentiel, rédaction d&apos;un premier email et recommandation — le
            tout en une seule demande. Aucun email n&apos;est envoyé automatiquement.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions en attente d&apos;approbation ({pendingActions.length})</CardTitle>
        </CardHeader>
        {pendingActions.length === 0 ? (
          <EmptyState title="Aucune action en attente" />
        ) : (
          <div className="space-y-3">
            {pendingActions.map((action) => (
              <div key={action.id} className="rounded-lg border border-p360-lavender-light p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Badge variant="neutral">{ACTION_TYPE_LABEL[action.type] ?? action.type}</Badge>
                    <span className="font-medium text-p360-ink">{action.title}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Button variant="secondary" loading={busyId === action.id} onClick={() => handleDecision(action.id, "approve")}>
                      Accepter
                    </Button>
                    <Button variant="danger" loading={busyId === action.id} onClick={() => handleDecision(action.id, "reject")}>
                      Refuser
                    </Button>
                  </span>
                </div>
                {typeof action.payload === "object" && action.payload !== null && "body" in action.payload && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-p360-muted">
                    {String((action.payload as { body: unknown }).body)}
                  </p>
                )}
                {action.reasoning && <p className="mt-1 text-xs text-p360-muted italic">{action.reasoning}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {approvedActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Actions approuvées — prêtes à envoyer</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {approvedActions.map((action) => (
              <div key={action.id} className="flex items-center justify-between text-sm">
                <span>
                  <Badge variant="info">{ACTION_TYPE_LABEL[action.type] ?? action.type}</Badge> {action.title}
                </span>
                <Button variant="primary" loading={busyId === action.id} onClick={() => handleSend(action.id)}>
                  Envoyer
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        {prospects.length === 0 ? (
          <EmptyState title="Aucun prospect" description="Ajoutez votre premier prospect ci-dessus." />
        ) : (
          <div className="divide-y divide-p360-lavender-light">
            {prospects.map((prospect) => (
              <div key={prospect.id} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant={STAGE_VARIANT[prospect.stage] ?? "neutral"}>{STAGE_LABEL[prospect.stage] ?? prospect.stage}</Badge>
                  <span className="text-p360-ink">{prospect.companyName}</span>
                  <span className="text-xs text-p360-muted">{prospect.sector ?? "secteur inconnu"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-p360-muted">Score : {prospect.score ?? "—"}</span>
                  <Button variant="secondary" loading={busyId === prospect.id} onClick={() => handleReanalyze(prospect.id)}>
                    Nouvelle analyse
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des actions</CardTitle>
        </CardHeader>
        {recentActions.length === 0 ? (
          <EmptyState title="Aucune action" />
        ) : (
          <ul className="space-y-1 text-sm">
            {recentActions.map((action) => (
              <li key={action.id} className="flex items-center justify-between">
                <span>
                  <Badge variant={ACTION_STATUS_VARIANT[action.status] ?? "neutral"}>{action.status}</Badge>{" "}
                  <Badge variant="neutral">{ACTION_TYPE_LABEL[action.type] ?? action.type}</Badge>{" "}
                  <span className="text-p360-ink">{action.prospectCompanyName}</span>
                </span>
                <span className="text-xs text-p360-muted">{new Date(action.createdAt).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
