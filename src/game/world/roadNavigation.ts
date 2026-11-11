import type { DistrictId, RoadEdge, RoadGraph } from './roadGraph';

export type Point2D = { x: number; y: number };

export type DirectedRoad = {
  edge: RoadEdge;
  from: string;
  to: string;
  reversed: boolean;
};

/** Returns road segments that can legally be entered from the supplied junction. */
export function getAvailableRoads(graph: RoadGraph, nodeId: string): DirectedRoad[] {
  const roads: DirectedRoad[] = [];
  for (const edge of graph.edges) {
    if (edge.from === nodeId) {
      roads.push({ edge, from: edge.from, to: edge.to, reversed: false });
    } else if (edge.bidirectional && edge.to === nodeId) {
      roads.push({ edge, from: edge.to, to: edge.from, reversed: true });
    }
  }
  return roads;
}

/** Returns the road geometry oriented in the direction of travel. */
export function getDirectedGeometry(road: DirectedRoad): Point2D[] {
  const points = road.edge.points.map(({ x, y }) => ({ x, y }));
  return road.reversed ? points.reverse() : points;
}

/** Samples a point along a polyline. Progress is clamped to the [0, 1] interval. */
export function sampleRoadPosition(points: ReadonlyArray<Point2D>, progress: number): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };

  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = distance(points[index - 1], points[index]);
    lengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return { ...points[0] };

  let remaining = Math.min(1, Math.max(0, progress)) * totalLength;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength || index === lengths.length - 1) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: lerp(points[index].x, points[index + 1].x, ratio),
        y: lerp(points[index].y, points[index + 1].y, ratio),
      };
    }
    remaining -= segmentLength;
  }
  return { ...points[points.length - 1] };
}

/** Resolves the district label associated with a graph node, if one exists. */
export function getDistrictAtNode(graph: RoadGraph, nodeId: string): DistrictId | undefined {
  return graph.nodes.find((node) => node.id === nodeId)?.district;
}

/** Projects normalized map coordinates into a pixel-sized minimap viewport. */
export function projectToMinimap(point: Point2D, width: number, height: number, inset = 0): Point2D {
  const usableWidth = Math.max(0, width - inset * 2);
  const usableHeight = Math.max(0, height - inset * 2);
  return {
    x: inset + Math.min(1, Math.max(0, point.x)) * usableWidth,
    y: inset + Math.min(1, Math.max(0, point.y)) * usableHeight,
  };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}
