#!/usr/bin/env node
const path = require('node:path');
require(path.join(__dirname, '../../test/helpers/register-ts'));
const Vector = require('../../src/Physics/Vector').default;
const PackedEntitySet = require('../../src/Physics/PackedEntitySet').default;
const HashGrid = require('../../src/Physics/HashGrid').default;

const round = (n) => {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  return Math.round(n * 1e6) / 1e6;
};
const vec = (v) => ({ x: round(v.x), y: round(v.y), magnitude: round(v.magnitude), angle: round(v.angle), finite: Vector.isFinite(v) });

function vectorReport() {
  const base = new Vector(3, 4);
  const afterAdd = new Vector(3, 4); afterAdd.add({ x: -1, y: 2 });
  const afterSubtract = new Vector(3, 4); afterSubtract.subtract({ x: 10, y: -3 });
  const angleSet = new Vector(3, 4); angleSet.angle = Math.PI / 2;
  const magnitudeSet = new Vector(3, 4); magnitudeSet.magnitude = 10;
  const zeroMagnitude = new Vector(0, 0); zeroMagnitude.magnitude = 5;
  const polar = Vector.fromPolar(Math.PI / 6, 12);
  const nonFinite = new Vector(Infinity, NaN);
  return {
    base: vec(base),
    afterSet: (() => { const v = new Vector(); v.set({ x: -8, y: 9 }); return vec(v); })(),
    afterAdd: vec(afterAdd),
    afterSubtract: vec(afterSubtract),
    distanceToSQ: round(base.distanceToSQ({ x: -1, y: 7 })),
    angleSet: vec(angleSet),
    magnitudeSet: vec(magnitudeSet),
    zeroMagnitude: vec(zeroMagnitude),
    polar: vec(polar),
    finiteChecks: [Vector.isFinite(base), Vector.isFinite(nonFinite)]
  };
}

function packedEntitySetReport() {
  const set = new PackedEntitySet();
  for (const id of [0, 1, 31, 32, 33, 1024, 16_383]) set.add(id);
  set.remove(32);
  const probes = [0, 1, 2, 31, 32, 33, 1024, 16_383];
  const beforeClear = probes.map((id) => [id, set.has(id)]);
  const firstWords = Array.from(set.data.slice(0, 35));
  set.clear();
  return {
    beforeClear,
    firstWords,
    afterClear: probes.map((id) => [id, set.has(id)]),
    fullSetHas: [0, 31, 32, 16_383].map((id) => [id, PackedEntitySet.FULL_SET.has(id)])
  };
}

function entity(id, x, y, size, sides = 4, width = size, hash = id + 1000) {
  return {
    id,
    hash,
    positionData: { values: { x, y } },
    physicsData: { values: { sides, size, width } }
  };
}

function hashGridReport() {
  const entities = [];
  const game = {
    arena: { width: 1024, height: 768, arenaData: { values: { leftX: -512, topY: -384 } } },
    entities: { inner: entities }
  };
  entities[1] = entity(1, -300, -100, 30);
  entities[2] = entity(2, -275, -105, 20);
  entities[3] = entity(3, 260, 100, 40);
  entities[4] = entity(4, 0, 0, 200, 2, 20);
  entities[5] = entity(5, -300, -100, 10, 4, 10, 0);

  const grid = new HashGrid(game);
  const lockedInsert = (() => { try { grid.insert(entities[1]); return 'no-error'; } catch (error) { return error.message; } })();
  grid.preTick(1);
  for (const id of [1, 2, 3, 4, 5]) grid.insert(entities[id]);
  const retrieve = (cx, cy, hw, hh) => [0, 1, 2, 3, 4, 5].filter((id) => grid.retrieve(cx, cy, hw, hh).has(id));
  const nearCluster = retrieve(-300, -100, 80, 80);
  const wholeArena = retrieve(0, 0, 600, 500);
  const lineEntity = retrieve(0, 0, 130, 30);
  const firstAny = grid.getFirstMatch(-300, -100, 80, 80, () => true);
  const firstLargeId = grid.getFirstMatch(-512, -384, 1024, 768, (e) => e.id >= 3);
  const pairs = [];
  grid.forEachCollisionPair((a, b) => pairs.push([a.id, b.id]));
  grid.postTick(1);
  const lockedRetrieve = (() => { try { grid.retrieve(0, 0, 1, 1); return 'no-error'; } catch (error) { return error.message; } })();
  return {
    lockedInsert,
    nearCluster,
    wholeArena,
    lineEntity,
    firstAny: firstAny && firstAny.id,
    firstLargeId: firstLargeId && firstLargeId.id,
    pairs,
    lockedRetrieve
  };
}

process.stdout.write(`${JSON.stringify({ vector: vectorReport(), packedEntitySet: packedEntitySetReport(), hashGrid: hashGridReport() }, null, 2)}\n`);
