import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_EDGES,
  ROAD_NODES,
  advanceRoad,
  createRoadState,
  getRoadPoint,
  retreatRoad,
} from '../src/game/world/RoadGraph.ts';

test('road graph references valid nodes and has no duplicate edge IDs', () => {
  const nodeIds = new Set(ROAD_NODES.map(node => node.id));
  const edgeIds = new Set();
  for (const edge of ROAD_EDGES) {
    assert.ok(nodeIds.has(edge.from), `missing from-node for ${edge.id}`);
    assert.ok(nodeIds.has(edge.to), `missing to-node for ${edge.id}`);
    assert.ok(!edgeIds.has(edge.id), `duplicate edge ID: ${edge.id}`);
    edgeIds.add(edge.id);
    const from = ROAD_NODES.find(node => node.id === edge.from);
    const to = ROAD_NODES.find(node => node.id === edge.to);
    assert.ok(to.distance > from.distance, `edge must move forward: ${edge.id}`);
  }
});

test('new run starts at the beginning of the first road edge', () => {
  const state = createRoadState();
  assert.equal(state.edgeId, 'start-farmgate');
  assert.equal(state.distance, 0);
  assert.equal(state.edgeProgress, 0);
  assert.deepEqual(state.history, []);
});

test('straight input follows the main route through Farmgate', () => {
  const state = advanceRoad(createRoadState(), 100, 0);
  assert.equal(state.distance, 100);
  assert.equal(state.edgeId, 'farmgate-shahbagh');
  assert.equal(state.nodeId, 'farmgate');
  assert.equal(state.x, 0);
});

test('left and right steering select the corresponding Farmgate branches', () => {
  const left = advanceRoad(createRoadState(), 70, -1);
  const right = advanceRoad(createRoadState(), 70, 1);
  assert.equal(left.edgeId, 'farmgate-tejgaon');
  assert.equal(right.edgeId, 'farmgate-karwan');
  assert.equal(left.nodeId, 'farmgate');
  assert.equal(right.nodeId, 'farmgate');
});

test('road position interpolates between the endpoints of an edge', () => {
  const point = getRoadPoint('farmgate-tejgaon', 0.5);
  assert.equal(point.x, -2.25);
  assert.equal(point.distance, 91);
});

test('reverse driving retraces the exact previously selected branch', () => {
  const forward = advanceRoad(createRoadState(), 130, -1);
  const reversed = retreatRoad(forward, 50);
  assert.equal(reversed.distance, 80);
  assert.equal(reversed.edgeId, 'farmgate-tejgaon');
  const reverseProgress = 10 / 42;
  const easedProgress = reverseProgress * reverseProgress * (3 - 2 * reverseProgress);
  assert.ok(Math.abs(reversed.x - (-4.5 * easedProgress)) < 1e-9);
  assert.deepEqual(reversed.history, ['start-farmgate']);
});

test('reverse driving stops at the route origin without negative distance', () => {
  const forward = advanceRoad(createRoadState(), 100, 1);
  const reversed = retreatRoad(forward, 500);
  assert.equal(reversed.distance, 0);
  assert.equal(reversed.edgeId, 'start-farmgate');
  assert.equal(reversed.edgeProgress, 0);
  assert.deepEqual(reversed.history, []);
});

test('advancing after reversing continues from the restored branch', () => {
  const forward = advanceRoad(createRoadState(), 130, -1);
  const reversed = retreatRoad(forward, 50);
  const continued = advanceRoad(reversed, 50, 0);
  assert.equal(continued.distance, 130);
  assert.equal(continued.edgeId, forward.edgeId);
  assert.ok(Math.abs(continued.x - forward.x) < 1e-9);
});


test('curved road eases laterally and reaches exact junction coordinates', () => {
  const start = getRoadPoint('farmgate-tejgaon', 0);
  const quarter = getRoadPoint('farmgate-tejgaon', 0.25);
  const middle = getRoadPoint('farmgate-tejgaon', 0.5);
  const end = getRoadPoint('farmgate-tejgaon', 1);
  assert.equal(start.x, 0);
  assert.ok(Math.abs(quarter.x - (-0.703125)) < 1e-9);
  assert.equal(middle.x, -2.25);
  assert.equal(end.x, -4.5);
  assert.ok(Math.abs(getRoadPoint('tejgaon-shahbagh', 0).x - end.x) < 1e-9);
  assert.equal(getRoadPoint('tejgaon-shahbagh', 1).x, 0);
});

test('left and right curves are mirrored around the main road', () => {
  for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const left = getRoadPoint('farmgate-tejgaon', progress);
    const right = getRoadPoint('farmgate-karwan', progress);
    assert.ok(Math.abs(left.x + right.x) < 1e-9);
    assert.ok(Math.abs(left.distance - right.distance) < 1e-9);
  }
});
