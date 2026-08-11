import { computeLevelProgress } from "@/lib/quest/xp";
import { momentumLabel } from "@/lib/quest/momentum";

const MOMENTUM_LABEL: Record<string, string> = {
  aucune_activite: "Aucune activité récente",
  reprise: "Reprise",
  bon_rythme: "Bon rythme",
  tres_forte_dynamique: "Très forte dynamique",
};

export type StatGaugesData = {
  xpTotal: number;
  disciplineScore: number;
  constanceScore: number;
  momentum: number;
  streakCurrent: number;
};

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-quest-muted">{label}</span>
        <span className="font-medium">{Math.round(value)}</span>
      </div>
      <div className="quest-progress-track">
        <div className="quest-progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** §23-27 du brief — peu de jauges, mais réellement utiles. */
export function StatGauges({ stat }: { stat: StatGaugesData }) {
  const level = computeLevelProgress(stat.xpTotal);
  const momentum = momentumLabel(stat.momentum);

  return (
    <div className="quest-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-quest-muted">Niveau {level.level}</p>
          <p className="text-sm font-medium">
            {level.xpIntoLevel} / {level.xpForNextLevel} XP
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-quest-muted">Streak</p>
          <p className="text-sm font-medium">{stat.streakCurrent} j</p>
        </div>
      </div>

      <Gauge label="Discipline" value={stat.disciplineScore} />
      <Gauge label="Constance" value={stat.constanceScore} />
      <Gauge label="Momentum" value={stat.momentum} />
      <p className="text-xs text-quest-muted">{MOMENTUM_LABEL[momentum]}</p>
    </div>
  );
}
