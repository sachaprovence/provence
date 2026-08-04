"use client";

export type PlanGraphNode =
  | { id: string; kind: "director"; label: string }
  | { id: string; kind: "step"; label: string; status: string; targetLabel: string; stepIndex: number };

export type PlanGraphEdge = { from: string; to: string; kind: "delegation" | "dependency" };

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#9ca3af",
  READY: "#9ca3af",
  DELEGATED: "#2563eb",
  RUNNING: "#2563eb",
  SUCCEEDED: "#16a34a",
  FAILED: "#dc2626",
  SKIPPED: "#ca8a04",
  CANCELLED: "#6b7280",
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const ROW_HEIGHT = 110;
const COL_GAP = 24;

/**
 * Visualisation graphique d'un plan du Director : Director en racine,
 * étapes disposées par rang de dépendance (une étape sans dépendance est au
 * rang 0, une étape qui dépend d'une autre est toujours à un rang
 * strictement supérieur — conséquence directe de la validation de DAG à la
 * création du plan, voir `planning-engine.ts#createPlan`). SVG pur, sans
 * dépendance à une librairie de graphes.
 */
export function DirectorPlanGraph({ nodes, edges }: { nodes: PlanGraphNode[]; edges: PlanGraphEdge[] }) {
  const directorNode = nodes.find((n) => n.kind === "director");
  const stepNodes = nodes.filter((n): n is Extract<PlanGraphNode, { kind: "step" }> => n.kind === "step");
  const dependencyEdges = edges.filter((e) => e.kind === "dependency");

  const incoming = new Map<string, string[]>();
  for (const node of stepNodes) incoming.set(node.id, []);
  for (const edge of dependencyEdges) incoming.get(edge.to)?.push(edge.from);

  const rank = new Map<string, number>();
  function computeRank(id: string, guard: Set<string>): number {
    if (rank.has(id)) return rank.get(id)!;
    if (guard.has(id)) return 0;
    guard.add(id);
    const deps = incoming.get(id) ?? [];
    const value = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => computeRank(dep, guard)));
    rank.set(id, value);
    return value;
  }
  for (const node of stepNodes) computeRank(node.id, new Set());

  const maxRank = stepNodes.length > 0 ? Math.max(...stepNodes.map((n) => rank.get(n.id) ?? 0)) : -1;
  const rows: (typeof stepNodes)[] = Array.from({ length: maxRank + 1 }, () => []);
  for (const node of stepNodes) rows[rank.get(node.id) ?? 0].push(node);
  for (const row of rows) row.sort((a, b) => a.stepIndex - b.stepIndex);

  const maxCols = Math.max(1, ...rows.map((row) => row.length));
  const width = Math.max(NODE_WIDTH + 40, maxCols * (NODE_WIDTH + COL_GAP));
  const height = (rows.length + 1) * ROW_HEIGHT + NODE_HEIGHT;

  const positions = new Map<string, { x: number; y: number }>();
  if (directorNode) {
    positions.set(directorNode.id, { x: width / 2 - NODE_WIDTH / 2, y: 0 });
  }
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.length * (NODE_WIDTH + COL_GAP) - COL_GAP;
    const startX = width / 2 - rowWidth / 2;
    row.forEach((node, colIndex) => {
      positions.set(node.id, { x: startX + colIndex * (NODE_WIDTH + COL_GAP), y: (rowIndex + 1) * ROW_HEIGHT });
    });
  });

  function center(id: string) {
    const pos = positions.get(id);
    if (!pos) return { x: 0, y: 0 };
    return { x: pos.x + NODE_WIDTH / 2, y: pos.y + NODE_HEIGHT / 2 };
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-p360-lavender-light bg-p360-surface p-4">
      <svg width={width} height={height} role="img" aria-label="Graphe du plan d'exécution">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#9ca3af" />
          </marker>
        </defs>

        {edges.map((edge, index) => {
          const from = center(edge.from);
          const to = center(edge.to);
          const dashed = edge.kind === "dependency";
          return (
            <line
              key={index}
              x1={from.x}
              y1={from.y + NODE_HEIGHT / 2}
              x2={to.x}
              y2={to.y - NODE_HEIGHT / 2}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray={dashed ? "4 3" : undefined}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {directorNode &&
          (() => {
            const pos = positions.get(directorNode.id)!;
            return (
              <g>
                <rect x={pos.x} y={pos.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={10} fill="#1e293b" />
                <text x={pos.x + NODE_WIDTH / 2} y={pos.y + NODE_HEIGHT / 2 + 5} textAnchor="middle" fill="white" fontSize={13} fontWeight={600}>
                  🧭 Director
                </text>
              </g>
            );
          })()}

        {stepNodes.map((node) => {
          const pos = positions.get(node.id)!;
          const color = STATUS_COLOR[node.status] ?? "#9ca3af";
          return (
            <g key={node.id}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={10}
                fill="white"
                stroke={color}
                strokeWidth={2}
              />
              <text x={pos.x + 10} y={pos.y + 20} fontSize={12} fontWeight={600} fill="#1e293b">
                {truncate(node.label, 26)}
              </text>
              <text x={pos.x + 10} y={pos.y + 37} fontSize={11} fill="#64748b">
                → {truncate(node.targetLabel, 24)}
              </text>
              <circle cx={pos.x + NODE_WIDTH - 14} cy={pos.y + 14} r={6} fill={color} />
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-p360-muted">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {status}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-p360-muted" /> dépendance
        </span>
      </div>
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
