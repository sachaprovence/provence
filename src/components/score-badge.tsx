import clsx from "clsx";

export function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="badge bg-gray-100 text-gray-500">—</span>;
  }
  const cls =
    value >= 80
      ? "bg-green-100 text-p360-success"
      : value >= 60
      ? "bg-p360-lavender-light text-p360-blue"
      : value >= 40
      ? "bg-p360-sand-light text-p360-warning"
      : "bg-gray-100 text-gray-600";
  return <span className={clsx("badge tabular-nums", cls)}>{value}</span>;
}
