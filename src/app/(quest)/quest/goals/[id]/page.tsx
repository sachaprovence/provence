import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getGoalDetail } from "@/lib/quest/goal-service";
import { GoalStatusActions } from "@/components/quest/goal-status-actions";

const MILESTONE_STATUS_LABEL: Record<string, string> = { PENDING: "À venir", ACTIVE: "En cours", DONE: "Terminé" };
const QUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "À faire",
  ACTIVE: "En cours",
  DONE: "Terminée",
  POSTPONED: "Reportée",
  BLOCKED: "Bloquée",
  REPLACED: "Remplacée",
  ABANDONED: "Abandonnée",
};

type Params = { params: Promise<{ id: string }> };

export default async function QuestGoalDetailPage({ params }: Params) {
  const actor = await requireActor();
  const { id } = await params;
  const { goal, milestones, quests } = await getGoalDetail(actor.user.id, id);

  const visibleQuests = quests.filter((q) => q.status !== "REPLACED");

  return (
    <div className="space-y-6">
      <Link href="/quest/goals" className="text-sm text-quest-muted">
        ← Objectifs
      </Link>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{goal.title}</h1>
        {goal.description && <p className="text-sm text-quest-muted">{goal.description}</p>}
        <div className="quest-progress-track">
          <div className="quest-progress-fill" style={{ width: `${goal.progressPercent}%` }} />
        </div>
        <p className="text-xs text-quest-muted">{Math.round(goal.progressPercent)}% terminé</p>
      </header>

      {(goal.currentState || goal.targetState) && (
        <div className="quest-card p-4 space-y-2 text-sm">
          {goal.currentState && (
            <p>
              <span className="text-quest-muted">Aujourd&apos;hui : </span>
              {goal.currentState}
            </p>
          )}
          {goal.targetState && (
            <p>
              <span className="text-quest-muted">Cible : </span>
              {goal.targetState}
            </p>
          )}
        </div>
      )}

      <GoalStatusActions goalId={goal.id} status={goal.status} />

      {milestones.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-quest-muted">Jalons</p>
          <div className="quest-card divide-y divide-quest-border">
            {milestones.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between gap-2">
                <span className={`text-sm ${m.status === "DONE" ? "line-through text-quest-muted" : ""}`}>{m.title}</span>
                <span className="quest-badge">{MILESTONE_STATUS_LABEL[m.status] ?? m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleQuests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-quest-muted">Quêtes</p>
          <div className="quest-card divide-y divide-quest-border">
            {visibleQuests.map((q) => (
              <div key={q.id} className="p-3 flex items-center justify-between gap-2">
                <span className={`text-sm ${q.status === "DONE" ? "line-through text-quest-muted" : ""}`}>{q.title}</span>
                <span className="quest-badge">{QUEST_STATUS_LABEL[q.status] ?? q.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
