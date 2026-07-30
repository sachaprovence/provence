import type { AutomationGraph, ActionNodeData, LoopNodeData, MapNodeData, SwitchNodeData, SubautomationNodeData } from "./graph-types";

/**
 * Validation structurelle pure (aucune I/O) — même rôle que
 * `workflows/graph-validation.ts` : utilisable côté serveur (Automation
 * Registry, avant d'enregistrer une version) et côté client (éditeur,
 * validation graphique) sans dupliquer la logique.
 */
export function validateAutomationGraph(graph: AutomationGraph): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const node of graph.nodes) {
    if (ids.has(node.id)) issues.push(`Identifiant de noeud dupliqué : "${node.id}".`);
    ids.add(node.id);
  }

  if (graph.nodes.filter((n) => n.type === "trigger").length === 0) {
    issues.push("L'automatisation doit comporter au moins un noeud déclencheur.");
  }
  if (graph.nodes.filter((n) => n.type === "end").length === 0) {
    issues.push("L'automatisation doit comporter au moins un noeud de fin.");
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.source)) issues.push(`L'arête "${edge.id}" référence un noeud source inconnu : "${edge.source}".`);
    if (!ids.has(edge.target)) issues.push(`L'arête "${edge.id}" référence un noeud cible inconnu : "${edge.target}".`);
    if (edge.source === edge.target) issues.push(`L'arête "${edge.id}" boucle sur elle-même ("${edge.source}").`);
  }

  const subordinateIds = new Set(
    graph.nodes.filter((n) => n.type === "loop" || n.type === "map").flatMap((n) => (n.data as LoopNodeData | MapNodeData).bodyNodeIds ?? [])
  );

  for (const node of graph.nodes) {
    if (node.type === "condition") {
      const outgoing = graph.edges.filter((e) => e.source === node.id);
      if (!outgoing.some((e) => e.branch === "true") && !outgoing.some((e) => e.branch === "false")) {
        issues.push(`Le noeud condition "${node.id}" n'a aucune arête de branche ("true"/"false").`);
      }
    }
    if (node.type === "switch") {
      const data = node.data as SwitchNodeData;
      const outgoing = graph.edges.filter((e) => e.source === node.id);
      for (const c of data.cases ?? []) {
        if (!outgoing.some((e) => e.branch === c.branch)) {
          issues.push(`Le noeud switch "${node.id}" n'a aucune arête pour la branche "${c.branch}".`);
        }
      }
    }
    if (node.type === "action" && !(node.data as ActionNodeData).jobType) {
      issues.push(`Le noeud action "${node.id}" n'a pas de type de job.`);
    }
    if (node.type === "subautomation" && !(node.data as SubautomationNodeData).automationKey) {
      issues.push(`Le noeud sous-automatisation "${node.id}" n'a pas de clé d'automatisation cible.`);
    }
    if (node.type === "loop" || node.type === "map") {
      const data = node.data as LoopNodeData | MapNodeData;
      if (data.bodyNodeIds?.includes(node.id)) {
        issues.push(`Le noeud "${node.id}" (${node.type}) ne peut pas se contenir lui-même.`);
      }
      for (const bodyId of data.bodyNodeIds ?? []) {
        if (!ids.has(bodyId)) issues.push(`Le noeud "${node.id}" (${node.type}) référence un noeud de corps inconnu : "${bodyId}".`);
      }
    }
  }

  const topEdges = graph.edges.filter((e) => !subordinateIds.has(e.source) && !subordinateIds.has(e.target));
  const adjacency = new Map<string, string[]>();
  for (const edge of topEdges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const node of graph.nodes) {
    if (subordinateIds.has(node.id)) continue;
    if (hasCycle(node.id)) {
      issues.push("Le graphe contient un cycle en dehors d'un corps de boucle/map explicite.");
      break;
    }
  }

  return issues;
}
