"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";

type DeadLetterRow = {
  id: string;
  jobType: string;
  automationRunId: string | null;
  nodeId: string | null;
  attempt: number;
  maxAttempts: number;
  error: unknown;
  finishedAt: string | null;
};

export function AutomationDlqClient({ jobs, canManage }: { jobs: DeadLetterRow[]; canManage: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function replay(jobId: string) {
    setBusy(jobId);
    try {
      await apiPost(`/api/automations/dlq/${jobId}/replay`);
      push({ title: "Job remis en file", variant: "success" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec de la relance", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dead Letter Queue ({jobs.length})</CardTitle>
      </CardHeader>
      {jobs.length === 0 ? (
        <EmptyState title="Aucun job en échec définitif" description="Les jobs dont les tentatives sont épuisées apparaîtront ici." />
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-md border border-p360-lavender-light p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-p360-ink">{job.jobType}</span>
                  {job.nodeId && <span className="ml-2 text-xs text-p360-muted">noeud {job.nodeId}</span>}
                  {job.automationRunId && (
                    <p className="text-xs text-p360-muted">
                      Run :{" "}
                      <Link href={`/automations/runs/${job.automationRunId}`} className="text-p360-blue underline">
                        {job.automationRunId}
                      </Link>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="danger">
                    {job.attempt} / {job.maxAttempts} tentative(s)
                  </Badge>
                  {canManage && (
                    <Button variant="secondary" loading={busy === job.id} onClick={() => replay(job.id)}>
                      Relancer
                    </Button>
                  )}
                </div>
              </div>
              {job.error !== null && (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs text-p360-danger">{JSON.stringify(job.error, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
