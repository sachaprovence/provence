import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getTodaySnapshot } from "@/lib/quest/dashboard-service";
import { NextQuestCard, type NextQuestCardData } from "@/components/quest/next-quest-card";
import { CheckInPanel } from "@/components/quest/checkin-panel";
import { StatGauges } from "@/components/quest/stat-gauges";

export default async function QuestTodayPage() {
  const actor = await requireActor();
  const snapshot = await getTodaySnapshot(actor.user.id);

  const questRecord = snapshot.nextAction?.questRecord;
  const nextQuest: NextQuestCardData | null = questRecord
    ? {
        id: questRecord.id,
        title: questRecord.title,
        description: questRecord.description,
        why: questRecord.why,
        type: questRecord.type,
        estimatedMinutes: questRecord.estimatedMinutes,
        difficulty: questRecord.difficulty,
        xpReward: questRecord.xpReward,
        status: questRecord.status,
      }
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-quest-muted">Aujourd&apos;hui</p>
        <h1 className="text-xl font-semibold">Salut {actor.user.firstName}</h1>
      </header>

      {snapshot.primaryGoal ? (
        <Link href={`/quest/goals/${snapshot.primaryGoal.id}`} className="quest-card p-4 space-y-2 block">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{snapshot.primaryGoal.title}</span>
            <span className="quest-badge">{Math.round(snapshot.primaryGoal.progressPercent)}%</span>
          </div>
          <div className="quest-progress-track">
            <div className="quest-progress-fill" style={{ width: `${snapshot.primaryGoal.progressPercent}%` }} />
          </div>
        </Link>
      ) : (
        <div className="quest-card p-5 text-center space-y-3">
          <p className="text-sm text-quest-muted">Tu n&apos;as pas encore d&apos;objectif.</p>
          <Link href="/quest/goals/new" className="quest-btn-primary inline-block">
            Créer mon parcours
          </Link>
        </div>
      )}

      {nextQuest ? (
        <NextQuestCard quest={nextQuest} />
      ) : snapshot.primaryGoal ? (
        <div className="quest-card p-5 text-center text-sm text-quest-muted">Aucune quête disponible pour le moment.</div>
      ) : null}

      <CheckInPanel />

      <div className="quest-card p-4 text-sm">
        <span className="font-medium">{snapshot.completedTodayCount}</span> action{snapshot.completedTodayCount > 1 ? "s" : ""} terminée
        {snapshot.completedTodayCount > 1 ? "s" : ""} aujourd&apos;hui
      </div>

      <StatGauges stat={snapshot.stat} />

      {snapshot.secondaryGoals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-quest-muted">Autres objectifs</p>
          {snapshot.secondaryGoals.map((g) => (
            <Link key={g.id} href={`/quest/goals/${g.id}`} className="quest-card p-3 flex items-center justify-between">
              <span className="text-sm">{g.title}</span>
              <span className="text-sm text-quest-muted">{Math.round(g.progressPercent)}%</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
