import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listGoals } from "@/lib/quest/goal-service";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "En cours",
  PAUSED: "En pause",
  COMPLETED: "Terminé",
  ABANDONED: "Abandonné",
  ARCHIVED: "Archivé",
};

export default async function QuestGoalsPage() {
  const actor = await requireActor();
  const goals = await listGoals(actor.user.id);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Objectifs</h1>
        <Link href="/quest/goals/new" className="quest-btn-primary">
          Nouvel objectif
        </Link>
      </header>

      {goals.length === 0 ? (
        <div className="quest-card p-5 text-center space-y-3">
          <p className="text-sm text-quest-muted">Aucun objectif pour l&apos;instant.</p>
          <Link href="/quest/goals/new" className="quest-btn-primary inline-block">
            Créer mon premier objectif
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <Link key={goal.id} href={`/quest/goals/${goal.id}`} className="quest-card p-4 block space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{goal.title}</span>
                {goal.priority === "PRIMARY" && <span className="quest-badge">Principal</span>}
              </div>
              <div className="quest-progress-track">
                <div className="quest-progress-fill" style={{ width: `${goal.progressPercent}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-quest-muted">
                <span>{STATUS_LABEL[goal.status] ?? goal.status}</span>
                <span>{Math.round(goal.progressPercent)}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
