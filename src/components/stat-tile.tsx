export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-p360-muted">{label}</div>
      <div className="text-2xl font-semibold text-p360-ink mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-p360-muted mt-1">{sub}</div>}
    </div>
  );
}
