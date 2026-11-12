export type RoadNode = { id: string; label: string; x: number; distance: number };
export type RoadEdge = { id: string; from: string; to: string; choice: -1 | 0 | 1 };

export const ROAD_NODES: RoadNode[] = [
  { id: 'start', label: 'শুরু', x: 0, distance: 0 },
  { id: 'farmgate', label: 'ফার্মগেট', x: 0, distance: 70 },
  { id: 'tejgaon-link', label: 'তেজগাঁও লিংক', x: -9, distance: 112 },
  { id: 'karwan-link', label: 'কারওয়ান বাজার', x: 9, distance: 112 },
  { id: 'shahbagh', label: 'শাহবাগ', x: 0, distance: 158 },
  { id: 'katabon-link', label: 'কাটাবন', x: -9, distance: 202 },
  { id: 'nilkhet-link', label: 'নীলক্ষেত', x: 9, distance: 202 },
  { id: 'dhanmondi', label: 'ধানমন্ডি', x: 0, distance: 246 },
  { id: 'satmasjid-link', label: 'সাতমসজিদ রোড', x: -9, distance: 290 },
  { id: 'jigatola-link', label: 'জিগাতলা', x: 9, distance: 290 },
  { id: 'finish', label: 'ফিনিশ', x: 0, distance: 1200 },
];

export const ROAD_EDGES: RoadEdge[] = [
  { id: 'start-farmgate', from: 'start', to: 'farmgate', choice: 0 },
  { id: 'farmgate-shahbagh', from: 'farmgate', to: 'shahbagh', choice: 0 },
  { id: 'farmgate-tejgaon', from: 'farmgate', to: 'tejgaon-link', choice: -1 },
  { id: 'tejgaon-shahbagh', from: 'tejgaon-link', to: 'shahbagh', choice: 0 },
  { id: 'farmgate-karwan', from: 'farmgate', to: 'karwan-link', choice: 1 },
  { id: 'karwan-shahbagh', from: 'karwan-link', to: 'shahbagh', choice: 0 },
  { id: 'shahbagh-dhanmondi', from: 'shahbagh', to: 'dhanmondi', choice: 0 },
  { id: 'shahbagh-katabon', from: 'shahbagh', to: 'katabon-link', choice: -1 },
  { id: 'katabon-dhanmondi', from: 'katabon-link', to: 'dhanmondi', choice: 0 },
  { id: 'shahbagh-nilkhet', from: 'shahbagh', to: 'nilkhet-link', choice: 1 },
  { id: 'nilkhet-dhanmondi', from: 'nilkhet-link', to: 'dhanmondi', choice: 0 },
  { id: 'dhanmondi-finish', from: 'dhanmondi', to: 'finish', choice: 0 },
  { id: 'dhanmondi-satmasjid', from: 'dhanmondi', to: 'satmasjid-link', choice: -1 },
  { id: 'satmasjid-finish', from: 'satmasjid-link', to: 'finish', choice: 0 },
  { id: 'dhanmondi-jigatola', from: 'dhanmondi', to: 'jigatola-link', choice: 1 },
  { id: 'jigatola-finish', from: 'jigatola-link', to: 'finish', choice: 0 },
];

export type RoadState = { edgeId: string; edgeProgress: number; distance: number; nodeId: string; pendingChoice: -1 | 0 | 1 };
export type RoadAdvance = RoadState & { x: number; district: string; nextChoices: Array<{ direction: -1 | 1; label: string }> };

const nodeById = new Map(ROAD_NODES.map(node => [node.id, node]));
const edgeById = new Map(ROAD_EDGES.map(edge => [edge.id, edge]));
const outgoing = (nodeId: string) => ROAD_EDGES.filter(edge => edge.from === nodeId);

export function createRoadState(): RoadState {
  return { edgeId: 'start-farmgate', edgeProgress: 0, distance: 0, nodeId: 'start', pendingChoice: 0 };
}

export function getRoadPoint(edgeId: string, progress: number) {
  const edge = edgeById.get(edgeId);
  if (!edge) return { x: 0, distance: 0 };
  const from = nodeById.get(edge.from)!;
  const to = nodeById.get(edge.to)!;
  const t = Math.max(0, Math.min(1, progress));
  return { x: from.x + (to.x - from.x) * t, distance: from.distance + (to.distance - from.distance) * t };
}

export function advanceRoad(state: RoadState, amount: number, steer: number): RoadAdvance {
  let edgeId = state.edgeId;
  let edgeProgress = state.edgeProgress;
  let distance = state.distance;
  let nodeId = state.nodeId;
  let pendingChoice = state.pendingChoice;
  let remaining = Math.max(0, amount);
  for (let guard = 0; guard < 8 && remaining > 0; guard++) {
    const edge = edgeById.get(edgeId)!;
    const from = nodeById.get(edge.from)!;
    const to = nodeById.get(edge.to)!;
    const edgeLength = Math.max(0.001, to.distance - from.distance);
    const available = (1 - edgeProgress) * edgeLength;
    if (available <= 18 && Math.abs(steer) > 0.35) pendingChoice = Math.sign(steer) as -1 | 1;
    const step = Math.min(remaining, available);
    edgeProgress += step / edgeLength;
    distance += step;
    remaining -= step;
    if (edgeProgress >= 0.999999) {
      nodeId = edge.to;
      edgeProgress = 0;
      const choices = outgoing(nodeId);
      if (!choices.length) break;
      const branch = pendingChoice || (Math.abs(steer) > 0.35 ? Math.sign(steer) as -1 | 1 : 0);
      const next = choices.find(candidate => candidate.choice === branch)
        ?? choices.find(candidate => candidate.choice === 0)
        ?? choices[0];
      edgeId = next.id;
      pendingChoice = 0;
    }
  }
  const point = getRoadPoint(edgeId, edgeProgress);
  const district = distance < 112 ? 'ফার্মগেট' : distance < 202 ? 'শাহবাগ' : 'ধানমন্ডি';
  const nextChoices = outgoing(nodeId)
    .filter(edge => edge.choice !== 0)
    .map(edge => ({ direction: edge.choice as -1 | 1, label: nodeById.get(edge.to)?.label ?? '' }));
  return { edgeId, edgeProgress, distance, nodeId, pendingChoice, x: point.x, district, nextChoices };
}

export function retreatRoad(state: RoadState, amount: number): RoadAdvance {
  let edgeId = state.edgeId;
  let edgeProgress = state.edgeProgress;
  let distance = state.distance;
  let nodeId = state.nodeId;
  let remaining = Math.max(0, amount);
  for (let guard = 0; guard < 8 && remaining > 0; guard++) {
    const edge = edgeById.get(edgeId)!;
    const from = nodeById.get(edge.from)!;
    const edgeLength = Math.max(0.001, nodeById.get(edge.to)!.distance - from.distance);
    if (edgeProgress <= 0.000001) {
      const previous = ROAD_EDGES.filter(candidate => candidate.to === from.id);
      if (!previous.length) break;
      const previousEdge = previous.find(candidate => candidate.choice === 0) ?? previous[0];
      edgeId = previousEdge.id;
      edgeProgress = 1;
      nodeId = previousEdge.from;
      continue;
    }
    const available = edgeProgress * edgeLength;
    const step = Math.min(remaining, available);
    edgeProgress -= step / edgeLength;
    distance = Math.max(0, distance - step);
    remaining -= step;
    if (edgeProgress <= 0.000001) {
      edgeProgress = 0;
      nodeId = from.id;
    }
  }
  const point = getRoadPoint(edgeId, edgeProgress);
  const district = distance < 112 ? 'ফার্মগেট' : distance < 202 ? 'শাহবাগ' : 'ধানমন্ডি';
  const nextChoices = outgoing(nodeId)
    .filter(edge => edge.choice !== 0)
    .map(edge => ({ direction: edge.choice as -1 | 1, label: nodeById.get(edge.to)?.label ?? '' }));
  return { edgeId, edgeProgress, distance, nodeId, pendingChoice: 0, x: point.x, district, nextChoices };
}

export function roadMapPoint(nodeId: string) {
  const node = nodeById.get(nodeId);
  return node ? { x: node.x, y: node.distance } : { x: 0, y: 0 };
}
