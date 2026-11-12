export type DistrictId = 'farmgate' | 'shahbagh' | 'dhanmondi';

export type RoadNode = {
  id: string;
  x: number;
  y: number;
  kind: 'junction' | 'district-gate' | 'dead-end';
  district?: DistrictId;
  label?: string;
};

export type RoadEdge = {
  id: string;
  from: string;
  to: string;
  width: number;
  bidirectional: boolean;
  points: ReadonlyArray<{ x: number; y: number }>;
  roadClass: 'major';
};

export type MapLandmark = {
  id: string;
  kind: 'bus-stop' | 'traffic-signal' | 'parliament';
  x: number;
  y: number;
  label: string;
};

export type RoadGraph = {
  coordinateSpace: 'normalized';
  nodes: ReadonlyArray<RoadNode>;
  edges: ReadonlyArray<RoadEdge>;
  landmarks: ReadonlyArray<MapLandmark>;
};

/**
 * Draft topology for the first connected, fictional Dhaka-inspired map.
 * Coordinates are normalized (0..1), not geographic coordinates.
 * This is a technical starter graph; visual road geometry remains subject to
 * map-art iteration and product review.
 */
export const STARTER_ROAD_GRAPH: RoadGraph = {
  coordinateSpace: 'normalized',
  nodes: [
    { id: 'farmgate-west', x: 0.16, y: 0.18, kind: 'district-gate', district: 'farmgate', label: 'ফার্মগেট' },
    { id: 'farmgate-central', x: 0.43, y: 0.2, kind: 'junction', district: 'farmgate' },
    { id: 'farmgate-south', x: 0.44, y: 0.39, kind: 'junction', district: 'farmgate' },
    { id: 'shahbagh-north', x: 0.68, y: 0.43, kind: 'district-gate', district: 'shahbagh', label: 'শাহবাগ' },
    { id: 'shahbagh-central', x: 0.52, y: 0.62, kind: 'junction', district: 'shahbagh' },
    { id: 'dhanmondi-east', x: 0.77, y: 0.78, kind: 'district-gate', district: 'dhanmondi', label: 'ধানমন্ডি' },
    { id: 'dhanmondi-west', x: 0.25, y: 0.8, kind: 'junction', district: 'dhanmondi' },
    { id: 'parliament-road', x: 0.16, y: 0.52, kind: 'junction' },
  ],
  edges: [
    { id: 'farmgate-crossing', from: 'farmgate-west', to: 'farmgate-central', width: 0.1, bidirectional: true, roadClass: 'major', points: [{ x: 0.16, y: 0.18 }, { x: 0.3, y: 0.16 }, { x: 0.43, y: 0.2 }] },
    { id: 'farmgate-south-link', from: 'farmgate-central', to: 'farmgate-south', width: 0.085, bidirectional: true, roadClass: 'major', points: [{ x: 0.43, y: 0.2 }, { x: 0.46, y: 0.3 }, { x: 0.44, y: 0.39 }] },
    { id: 'farmgate-parliament-link', from: 'farmgate-west', to: 'parliament-road', width: 0.09, bidirectional: true, roadClass: 'major', points: [{ x: 0.16, y: 0.18 }, { x: 0.12, y: 0.34 }, { x: 0.16, y: 0.52 }] },
    { id: 'parliament-shahbagh-link', from: 'parliament-road', to: 'shahbagh-central', width: 0.1, bidirectional: true, roadClass: 'major', points: [{ x: 0.16, y: 0.52 }, { x: 0.33, y: 0.57 }, { x: 0.52, y: 0.62 }] },
    { id: 'farmgate-shahbagh-link', from: 'farmgate-south', to: 'shahbagh-north', width: 0.1, bidirectional: true, roadClass: 'major', points: [{ x: 0.44, y: 0.39 }, { x: 0.56, y: 0.38 }, { x: 0.68, y: 0.43 }] },
    { id: 'shahbagh-connector', from: 'shahbagh-north', to: 'shahbagh-central', width: 0.085, bidirectional: true, roadClass: 'major', points: [{ x: 0.68, y: 0.43 }, { x: 0.63, y: 0.53 }, { x: 0.52, y: 0.62 }] },
    { id: 'shahbagh-dhanmondi-link', from: 'shahbagh-central', to: 'dhanmondi-east', width: 0.1, bidirectional: true, roadClass: 'major', points: [{ x: 0.52, y: 0.62 }, { x: 0.65, y: 0.69 }, { x: 0.77, y: 0.78 }] },
    { id: 'dhanmondi-west-link', from: 'shahbagh-central', to: 'dhanmondi-west', width: 0.1, bidirectional: true, roadClass: 'major', points: [{ x: 0.52, y: 0.62 }, { x: 0.4, y: 0.73 }, { x: 0.25, y: 0.8 }] },
  ],
  landmarks: [
    { id: 'bus-stop-farmgate', kind: 'bus-stop', x: 0.34, y: 0.18, label: 'ফার্মগেট বাসস্টপ' },
    { id: 'signal-farmgate', kind: 'traffic-signal', x: 0.44, y: 0.39, label: 'ট্রাফিক সিগন্যাল' },
    { id: 'bus-stop-shahbagh', kind: 'bus-stop', x: 0.62, y: 0.55, label: 'শাহবাগ বাসস্টপ' },
    { id: 'parliament-building', kind: 'parliament', x: 0.08, y: 0.49, label: 'জাতীয় সংসদ ভবন' },
    { id: 'signal-dhanmondi', kind: 'traffic-signal', x: 0.68, y: 0.73, label: 'ট্রাফিক সিগন্যাল' },
  ],
};

export type RoadGraphIssue = {
  code: 'DUPLICATE_NODE' | 'DUPLICATE_EDGE' | 'DANGLING_EDGE' | 'INVALID_COORDINATE' | 'INVALID_WIDTH' | 'DISCONNECTED_GRAPH' | 'INVALID_POLYLINE';
  subject: string;
  message: string;
};

export function validateRoadGraph(graph: RoadGraph): RoadGraphIssue[] {
  const issues: RoadGraphIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: 'DUPLICATE_NODE', subject: node.id, message: 'Node id must be unique.' });
    nodeIds.add(node.id);
    if (!isNormalized(node.x) || !isNormalized(node.y)) {
      issues.push({ code: 'INVALID_COORDINATE', subject: node.id, message: 'Node coordinates must be between 0 and 1.' });
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) issues.push({ code: 'DUPLICATE_EDGE', subject: edge.id, message: 'Edge id must be unique.' });
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ code: 'DANGLING_EDGE', subject: edge.id, message: 'Both edge endpoints must reference existing nodes.' });
      continue;
    }
    if (!Number.isFinite(edge.width) || edge.width <= 0) {
      issues.push({ code: 'INVALID_WIDTH', subject: edge.id, message: 'Road width must be a positive normalized value.' });
    }
    if (edge.points.length < 2) {
      issues.push({ code: 'INVALID_POLYLINE', subject: edge.id, message: 'A road edge must contain at least two geometry points.' });
    }
    for (const point of edge.points) {
      if (!isNormalized(point.x) || !isNormalized(point.y)) {
        issues.push({ code: 'INVALID_COORDINATE', subject: edge.id, message: 'Road geometry coordinates must be between 0 and 1.' });
      }
    }

    adjacency.get(edge.from)?.add(edge.to);
    if (edge.bidirectional) adjacency.get(edge.to)?.add(edge.from);
  }

  if (nodeIds.size > 0) {
    const start = nodeIds.values().next().value as string;
    const visited = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    if (visited.size !== nodeIds.size) {
      issues.push({ code: 'DISCONNECTED_GRAPH', subject: 'graph', message: 'All map nodes must be reachable from the starting node.' });
    }
  }

  return issues;
}

function isNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
