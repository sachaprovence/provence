"use client";

import { useCallback, useRef, useState } from "react";
import { clsx } from "clsx";

export type CanvasNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  hasIssue?: boolean;
};
export type CanvasEdge = { id: string; source: string; target: string; branch?: string };

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;

const TYPE_COLOR: Record<string, string> = {
  trigger: "#7c3aed",
  condition: "#ca8a04",
  action: "#2563eb",
  loop: "#0891b2",
  wait: "#64748b",
  subworkflow: "#be185d",
  end: "#16a34a",
};

const TYPE_ICON: Record<string, string> = {
  trigger: "⚡",
  condition: "◆",
  action: "▶",
  loop: "↻",
  wait: "⏱",
  subworkflow: "⧉",
  end: "■",
};

/**
 * Canevas d'édition de workflow : glisser-déposer des noeuds, connexion par
 * clic (source puis cible), zoom (molette) et déplacement du canevas (glisser
 * le fond). SVG + HTML pur, sans dépendance externe — même parti pris que
 * `director-plan-graph.tsx` (v0.4), étendu ici à l'interactivité complète
 * (déplacement, connexion) qu'un simple graphe en lecture seule n'exigeait
 * pas.
 */
export function WorkflowGraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  connectingFromId,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onCompleteConnection,
  onBackgroundClick,
}: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectingFromId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onMoveNode: (id: string, position: { x: number; y: number }) => void;
  onCompleteConnection: (targetId: string) => void;
  onBackgroundClick: () => void;
}) {
  const [viewport, setViewport] = useState({ x: 40, y: 40, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ nodeId: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const panState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    setViewport((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale - event.deltaY * 0.001)) }));
  }, []);

  function handleBackgroundMouseDown(event: React.MouseEvent) {
    if (event.target !== event.currentTarget) return;
    panState.current = { startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y };
  }

  function handleNodeMouseDown(event: React.MouseEvent, node: CanvasNode) {
    event.stopPropagation();
    dragState.current = { nodeId: node.id, startX: event.clientX, startY: event.clientY, originX: node.position.x, originY: node.position.y };
  }

  function handleMouseMove(event: React.MouseEvent) {
    if (dragState.current) {
      const dx = (event.clientX - dragState.current.startX) / viewport.scale;
      const dy = (event.clientY - dragState.current.startY) / viewport.scale;
      onMoveNode(dragState.current.nodeId, { x: dragState.current.originX + dx, y: dragState.current.originY + dy });
    } else if (panState.current) {
      const dx = event.clientX - panState.current.startX;
      const dy = event.clientY - panState.current.startY;
      setViewport((v) => ({ ...v, x: panState.current!.originX + dx, y: panState.current!.originY + dy }));
    }
  }

  function handleMouseUp() {
    dragState.current = null;
    panState.current = null;
  }

  function center(id: string) {
    const node = nodeById.get(id);
    if (!node) return { x: 0, y: 0 };
    return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y + NODE_HEIGHT / 2 };
  }

  function zoom(delta: number) {
    setViewport((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale + delta)) }));
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-p360-lavender-light bg-p360-sand-light/30" style={{ height: 560 }}>
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md bg-p360-surface p-1 shadow">
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => zoom(0.15)}>
          ➕
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => zoom(-0.15)}>
          ➖
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setViewport({ x: 40, y: 40, scale: 1 })}>
          ⤢ Réinitialiser
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) onBackgroundClick();
        }}
      >
        <div
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            transformOrigin: "0 0",
            position: "relative",
            width: 2000,
            height: 1400,
          }}
        >
          <svg width={2000} height={1400} className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const from = center(edge.source);
              const to = center(edge.target);
              const selected = edge.id === selectedEdgeId;
              return (
                <g key={edge.id} className="pointer-events-auto" onClick={() => onSelectEdge(edge.id)}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={selected ? "#1e293b" : edge.branch === "error" ? "#dc2626" : edge.branch === "false" ? "#dc2626" : edge.branch === "true" ? "#16a34a" : "#94a3b8"}
                    strokeWidth={selected ? 3 : 2}
                    markerEnd="url(#wf-arrow)"
                    style={{ cursor: "pointer" }}
                  />
                  {edge.branch && (
                    <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 4} fontSize={10} fill="#475569" textAnchor="middle">
                      {edge.branch}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const color = TYPE_COLOR[node.type] ?? "#64748b";
            const isSelected = node.id === selectedNodeId;
            const isConnecting = node.id === connectingFromId;
            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connectingFromId && connectingFromId !== node.id) {
                    onCompleteConnection(node.id);
                  } else {
                    onSelectNode(node.id);
                  }
                }}
                className={clsx(
                  "absolute flex select-none flex-col justify-center rounded-lg border-2 bg-p360-surface px-3 py-2 shadow-sm",
                  isSelected && "ring-2 ring-offset-1",
                  isConnecting && "animate-pulse"
                )}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  borderColor: color,
                  cursor: "grab",
                }}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
                  <span>{TYPE_ICON[node.type] ?? "●"}</span>
                  <span className="uppercase tracking-wide">{node.type}</span>
                  {node.hasIssue && <span title="Problème de validation">⚠️</span>}
                </div>
                <div className="mt-0.5 truncate text-sm text-p360-ink" title={node.label}>
                  {node.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
