import { requireActor } from "@/lib/auth";
import { ensureUserBootstrap } from "@/lib/quest/bootstrap";
import { listGoals } from "@/lib/quest/goal-service";
import { getLatestWeeklyReview } from "@/lib/quest/weekly-review-service";
import { StatGauges } from "@/components/quest/stat-gauges";
import { WeeklyReviewPanel } from "@/components/quest/weekly-review-panel";
import { computeLevelProgress } from "@/lib/quest/xp";

export default async function QuestProgressPage() {
  const actor = await requireActor();
  const [{ stat }, goals, review] = await Promise.all([
    ensureUserBootstrap(actor.user.id),
    listGoals(actor.user.id),
    getLatestWeeklyReview(actor.user.id),
  ]);

  const level = computeLevelProgress(stat.xpTotal);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Progression</h1>
      </header>

      <div className="quest-card p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-semibold">{level.level}</p>
          <p className="text-xs text-quest-muted">Niveau</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{stat.streakCurrent}</p>
          <p className="text-xs text-quest-muted">Streak (meilleur : {stat.streakBest})</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{stat.xpTotal}</p>
          <p className="text-xs text-quest-muted">XP total</p>
        </div>
      </div>

      <StatGauges stat={stat} />

      <div className="quest-card p-4 grid grid-cols-2 gap-3 text-center text-sm">
        <div>
          <p className="font-semibold">{stat.activeDays7}/7</p>
          <p className="text-xs text-quest-muted">Jours actifs (7j)</p>
        </div>
        <div>
          <p className="font-semibold">{stat.activeDays30}/30</p>
          <p className="text-xs text-quest-muted">Jours actifs (30j)</p>
        </div>
      </div>

      <WeeklyReviewPanel
        review={
          review
            ? {
                weekStart: review.weekStart.toISOString(),
                questsCompleted: review.questsCompleted,
                xpGained: review.xpGained,
                observations: review.observations,
                suggestions: review.suggestions,
              }
            : null
        }
      />

      {goals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-quest-muted">Progression par objectif</p>
          <div className="quest-card divide-y divide-quest-border">
            {goals.map((g) => (
              <div key={g.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{g.title}</span>
                  <span className="text-quest-muted">{Math.round(g.progressPercent)}%</span>
                </div>
                <div className="quest-progress-track">
                  <div className="quest-progress-fill" style={{ width: `${g.progressPercent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
