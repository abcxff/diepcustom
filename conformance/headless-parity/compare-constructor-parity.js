#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

require('../..//test/helpers/register-ts');
const { Tank, Color } = require('../../src/Const/Enums');
const TankDefinitions = require('../../src/Const/TankDefinitions');
const { SplitMix64Reference, withSeededRandom } = require('./rng-reference');

const root = path.join(__dirname, '../..');
const bin = path.join(root, 'build/cpp/headless_sim') + (process.platform === 'win32' ? '.exe' : '');
const round = (value) => Math.round(value * 1e6) / 1e6;
const snapshot = (args) => JSON.parse(execFileSync(bin, [...args, '--snapshot-json', '--no-report-json'], { cwd: root, encoding: 'utf8' }));
const byKind = (snap, kind) => snap.entities.filter((entity) => entity.kind === kind);
const agentByIndex = (snap, index) => snap.entities.find((entity) => entity.kind === 'agent' && entity.agentIndex === index);
const approx = (actual, expected, label) => assert.equal(round(actual), round(expected), label);

function assertBasicTankParity() {
  const tank = TankDefinitions[Tank.Basic];
  const snap = snapshot(['--seed=123', '--agents=1', '--ticks=0', '--scenario=basic-tank-parity']);
  const agent = byKind(snap, 'agent')[0];
  assert.ok(agent, 'basic-tank-parity must create an agent');
  assert.equal(agent.physics.sides, tank.sides);
  assert.equal(agent.physics.size, 50);
  assert.equal(agent.physics.width, 50);
  assert.equal(agent.health.health, tank.maxHealth);
  assert.equal(agent.health.maxHealth, tank.maxHealth);
  assert.equal(agent.damage.damagePerTick, 5);
  assert.equal(agent.teamId, agent.id);
  assert.equal(agent.barrels.length, tank.barrels.length);
  assert.deepEqual(agent.barrels[0], { ...tank.barrels[0], distance: 0 });
}

function assertBulletParity() {
  const tank = TankDefinitions[Tank.Basic];
  const barrel = tank.barrels[0];
  const bullet = barrel.bullet;
  const snap0 = snapshot(['--seed=123', '--agents=1', '--ticks=0', '--scenario=basic-bullet-parity']);
  const projectile0 = byKind(snap0, 'projectile')[0];
  assert.ok(projectile0, 'basic-bullet-parity must create a projectile');
  assert.equal(projectile0.physics.sides, 1);
  assert.equal(projectile0.physics.size, (barrel.width / 2) * bullet.sizeRatio);
  assert.equal(projectile0.health.health, 2 * bullet.health);
  assert.equal(projectile0.health.maxHealth, 2 * bullet.health);
  assert.equal(projectile0.damage.damagePerTick, 7 * bullet.damage);
  assert.equal(projectile0.projectile.lifeLength, bullet.lifeLength * 75);
  const bulletRng = new SplitMix64Reference(123n);
  const agentSpawnAngle = bulletRng.random() * Math.PI * 2;
  const scatterAngle = (Math.PI / 180) * bullet.scatterRate * (bulletRng.random() - 0.5) * 10;
  const baseSpeed = 50 - bulletRng.random() * bullet.scatterRate;
  approx(projectile0.projectile.scatterAngle, scatterAngle, 'seeded scatter angle');
  approx(projectile0.projectile.movementAngle, agentSpawnAngle + scatterAngle, 'seeded movement angle');
  approx(projectile0.projectile.baseSpeed, baseSpeed, 'seeded bullet base speed');
  assert.equal(snap0.rng.draws, bulletRng.draws);
  assert.equal(projectile0.ownerId, 0);
  assert.equal(projectile0.teamId, 0);

}

function assertShapeParity() {
  const snap = snapshot(['--seed=123', '--agents=0', '--ticks=0', '--scenario=shape-spawn-parity']);
  const shapes = snap.entities;
  const shapeRng = new SplitMix64Reference(123n);
  const expected = [
    { name: 'square', sides: 4, size: 55 * Math.SQRT1_2, health: 10, damage: 2, color: Color.EnemySquare, reward: 10, absorbtion: 1, push: 8 },
    { name: 'triangle', sides: 3, size: 55 * Math.SQRT1_2, health: 30, damage: 2, color: Color.EnemyTriangle, reward: 25, absorbtion: 1, push: 8 },
    { name: 'pentagon', sides: 5, size: 75 * Math.SQRT1_2, health: 100, damage: 3, color: Color.EnemyPentagon, reward: 130, absorbtion: 0.5, push: 11 },
    { name: 'crasher', sides: 3, size: 35 * Math.SQRT1_2, health: 10, damage: 2, color: Color.EnemyCrasher, reward: 15, absorbtion: 2, push: 8 },
  ];
  assert.equal(shapes.length, expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const entity = shapes[i];
    const exp = expected[i];
    assert.equal(entity.kind, exp.name === 'crasher' ? 'crasher' : 'shape');
    assert.equal(entity.physics.sides, exp.sides, exp.name);
    assert.equal(round(entity.physics.size), round(exp.size), exp.name);
    assert.equal(round(entity.physics.width), round(exp.size), exp.name);
    assert.equal(entity.health.health, exp.health, exp.name);
    assert.equal(entity.health.maxHealth, exp.health, exp.name);
    assert.equal(entity.damage.damagePerTick, exp.damage, exp.name);
    assert.equal(entity.styleColor, exp.color, exp.name);
    assert.equal(entity.score.scoreReward, exp.reward, exp.name);
  }
  const expectedDraws = [0, 1, 2, 3].reduce((draws, index) => draws + 2 + (index === 3 ? 1 : 0), 0);
  assert.equal(snap.rng.draws, expectedDraws);
}


function assertDynamicBulletParity() {
  const snap0 = snapshot(['--seed=123', '--agents=1', '--ticks=0', '--scenario=basic-bullet-parity']);
  const projectile0 = byKind(snap0, 'projectile')[0];
  assert.equal(projectile0.projectile.spawnTick, 0);
  assert.equal(projectile0.projectile.lifeLength, 75);
  assert.equal(projectile0.projectile.active, true);

  const snap1 = snapshot(['--seed=123', '--agents=1', '--ticks=1', '--scenario=basic-bullet-parity']);
  const projectile1 = byKind(snap1, 'projectile').find((entity) => entity.id === projectile0.id);
  assert.ok(projectile1.velocity.magnitude > projectile0.velocity.magnitude, 'first tick applies bullet base speed');

  const snap15 = snapshot(['--seed=123', '--agents=1', '--ticks=15', '--scenario=basic-bullet-parity']);
  assert.ok(byKind(snap15, 'projectile').length >= 2, 'basic reload of 15 ticks allows a second projectile from scripted fire');

  const snap75 = snapshot(['--seed=123', '--agents=1', '--ticks=75', '--scenario=basic-bullet-parity']);
  const oldest = byKind(snap75, 'projectile').find((entity) => entity.id === projectile0.id);
  assert.ok(!oldest || oldest.lifecycle.deleting || oldest.projectile.active, 'oldest projectile reached lifetime boundary without crashing');
}

function assertShapeManagerParity() {
  const snap = snapshot(['--seed=123', '--agents=0', '--ticks=0', '--scenario=shape-manager-parity']);
  assert.equal(snap.entities.length, 16);
  const kinds = new Set(snap.entities.map((entity) => entity.kind));
  assert.ok(kinds.has('shape'));
  assert.ok(snap.entities.every((entity) => entity.position.x >= -1000 && entity.position.x <= 1000 && entity.position.y >= -1000 && entity.position.y <= 1000));
  assert.deepEqual(snap, snapshot(['--seed=123', '--agents=0', '--ticks=0', '--scenario=shape-manager-parity']));
  const rng = new SplitMix64Reference(123n);
  const expectedPositions = [];
  for (let i = 0; i < 16; i += 1) {
    const x = Math.trunc(rng.random() * 2000 - 1000);
    const y = Math.trunc(rng.random() * 2000 - 1000);
    const maxXY = Math.max(x, y);
    const minXY = Math.min(x, y);
    let type;
    if (maxXY < 100 && minXY > -100) type = rng.random() <= 0.05 ? 'pentagon' : 'pentagon';
    else if (maxXY < 200 && minXY > -200) type = rng.random() < 0.2 ? 'crasher' : 'crasher';
    else { const rand = rng.random(); type = rand < 0.04 ? 'pentagon' : rand < 0.20 ? 'triangle' : 'square'; }
    if (type === 'crasher') rng.random();
    expectedPositions.push({ x, y, type });
  }
  for (let i = 0; i < expectedPositions.length; i += 1) {
    assert.equal(snap.entities[i].position.x, expectedPositions[i].x, `shape-manager x ${i}`);
    assert.equal(snap.entities[i].position.y, expectedPositions[i].y, `shape-manager y ${i}`);
  }
  assert.equal(snap.rng.draws, rng.draws);
}


function projectMultiTickSnapshot(snap) {
  const counts = snap.entities.reduce((acc, entity) => {
    acc[entity.kind] = (acc[entity.kind] || 0) + 1;
    return acc;
  }, {});
  return {
    tick: snap.tick,
    draws: snap.rng.draws,
    activeIds: snap.manager.activeIds,
    counts,
    agents: byKind(snap, 'agent').map((entity) => ({
      id: entity.id,
      health: round(entity.health.health),
      score: round(entity.score.score),
      x: round(entity.position.x),
      y: round(entity.position.y),
      vx: round(entity.velocity.x),
      vy: round(entity.velocity.y),
      deleting: entity.lifecycle.deleting,
    })),
    projectiles: byKind(snap, 'projectile').map((entity) => ({
      id: entity.id,
      x: round(entity.position.x),
      y: round(entity.position.y),
      vx: round(entity.velocity.x),
      vy: round(entity.velocity.y),
      spawnTick: entity.projectile.spawnTick,
      deleting: entity.lifecycle.deleting,
    })),
    firstEntities: snap.entities.slice(0, 6).map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      health: round(entity.health.health),
      score: round(entity.score.score),
      x: round(entity.position.x),
      y: round(entity.position.y),
      deleting: entity.lifecycle.deleting,
    })),
  };
}

function assertProjectionMatches(scenario, agents, tick, expected) {
  const snap = snapshot([`--seed=123`, `--agents=${agents}`, `--ticks=${tick}`, `--scenario=${scenario}`]);
  assert.deepEqual(projectMultiTickSnapshot(snap), expected, `${scenario} tick ${tick} normalized full-world projection`);
}

function assertMultiTickParity() {
  const bulletExpectations = {
    1: { tick: 1, draws: 5, activeIds: [0, 1, 2], counts: { agent: 1, projectile: 2 }, agents: [{ id: 0, health: 50, score: 0, x: -81.655885, y: -288.327669, vx: -0.595318, vy: 0.478793, deleting: false }], projectiles: [{ id: 1, x: -115.55441, y: -426.622189, vx: -8.02058, vy: -41.661272, spawnTick: 0, deleting: false }, { id: 2, x: 12.431095, y: -264.738724, vx: 1.13578, vy: 0.972047, spawnTick: 1, deleting: false }], firstEntities: [{ id: 0, kind: 'agent', health: 50, score: 0, x: -81.655885, y: -288.327669, deleting: false }, { id: 1, kind: 'projectile', health: 2, score: 0, x: -115.55441, y: -426.622189, deleting: false }, { id: 2, kind: 'projectile', health: 2, score: 0, x: 12.431095, y: -264.738724, deleting: false }] },
    10: { tick: 10, draws: 5, activeIds: [0, 1, 2], counts: { agent: 1, projectile: 2 }, agents: [{ id: 0, health: 50, score: 0, x: -54.483567, y: -316.213793, vx: 4.642402, vy: -4.687546, deleting: false }], projectiles: [{ id: 1, x: -177.870188, y: -750.308816, vx: -5.191855, vy: -26.968033, spawnTick: 0, deleting: false }, { id: 2, x: 365.195704, y: -160.250851, vx: 28.673089, vy: 8.421243, spawnTick: 1, deleting: false }], firstEntities: [{ id: 0, kind: 'agent', health: 50, score: 0, x: -54.483567, y: -316.213793, deleting: false }, { id: 1, kind: 'projectile', health: 2, score: 0, x: -177.870188, y: -750.308816, deleting: false }, { id: 2, kind: 'projectile', health: 2, score: 0, x: 365.195704, y: -160.250851, deleting: false }] },
    50: { tick: 50, draws: 9, activeIds: [0, 1, 2, 3, 4], counts: { agent: 1, projectile: 4 }, agents: [{ id: 0, health: 50, score: 0, x: 232.866338, y: -646.499508, vx: 7.395665, vy: -8.034849, deleting: false }], projectiles: [{ id: 1, x: -346.73366, y: -1200, vx: -3.429295, vy: -17.812776, spawnTick: 0, deleting: false }, { id: 2, x: 1200, y: 93.344622, vx: 17.478922, vy: 4.984109, spawnTick: 1, deleting: false }, { id: 3, x: 1026.476529, y: -173.685263, vx: 18.647475, vy: 4.917296, spawnTick: 19, deleting: false }, { id: 4, x: 749.601102, y: -449.415838, vx: 26.633504, vy: 4.108458, spawnTick: 37, deleting: false }], firstEntities: [{ id: 0, kind: 'agent', health: 50, score: 0, x: 232.866338, y: -646.499508, deleting: false }, { id: 1, kind: 'projectile', health: 2, score: 0, x: -346.73366, y: -1200, deleting: false }, { id: 2, kind: 'projectile', health: 2, score: 0, x: 1200, y: 93.344622, deleting: false }, { id: 3, kind: 'projectile', health: 2, score: 0, x: 1026.476529, y: -173.685263, deleting: false }, { id: 4, kind: 'projectile', health: 2, score: 0, x: 749.601102, y: -449.415838, deleting: false }] },
  };
  for (const [tick, expected] of Object.entries(bulletExpectations)) assertProjectionMatches('basic-bullet-parity', 1, Number(tick), expected);
}

function assertCollisionLifetimeParity() {
  const denseExpectations = {
    1: { tick: 1, draws: 15, activeIds: Array.from({ length: 30 }, (_, i) => i), counts: { agent: 3, shape: 18, crasher: 6, projectile: 3 }, agents: [{ id: 0, health: 0, score: 0, x: -8.462758, y: -46.1094, vx: 2.102848, vy: -6.835301, deleting: true }, { id: 1, health: 0, score: 0, x: -12.648263, y: 44.29105, vx: 1.85432, vy: 6.384165, deleting: true }, { id: 2, health: 0, score: 50, x: -39.403384, y: 0.503226, vx: 0.045473, vy: 6.381235, deleting: true }], projectiles: [{ id: 27, x: 84.311296, y: -10.449091, vx: 2.652313, vy: 4.522182, spawnTick: 1, deleting: true }, { id: 28, x: -100.929202, y: 79.682826, vx: -1.125, vy: 0, spawnTick: 1, deleting: false }, { id: 29, x: 33.87682, y: 55.235297, vx: -2.402343, vy: 4.340099, spawnTick: 1, deleting: true }], firstEntities: [{ id: 0, kind: 'agent', health: 0, score: 0, x: -8.462758, y: -46.1094, deleting: true }, { id: 1, kind: 'agent', health: 0, score: 0, x: -12.648263, y: 44.29105, deleting: true }, { id: 2, kind: 'agent', health: 0, score: 50, x: -39.403384, y: 0.503226, deleting: true }, { id: 3, kind: 'shape', health: 0, score: 0, x: -129.5, y: -48, deleting: true }, { id: 4, kind: 'shape', health: 0, score: 0, x: -92.54315, y: -50.596004, deleting: true }, { id: 5, kind: 'shape', health: 0.666667, score: 155, x: -57.484086, y: -84.761332, deleting: false }] },
    10: { tick: 10, draws: 15, activeIds: [13, 17, 21, 25], counts: { shape: 4 }, agents: [], projectiles: [], firstEntities: [{ id: 13, kind: 'shape', health: 23.333333, score: 155, x: 12.178823, y: -92.542971, deleting: false }, { id: 17, kind: 'shape', health: 3.333333, score: 180, x: 163.830781, y: -44.634268, deleting: false }, { id: 21, kind: 'shape', health: 35.333333, score: 0, x: -70.851953, y: 173.755633, deleting: false }, { id: 25, kind: 'shape', health: 19.333333, score: 25, x: 89.486984, y: 208.269982, deleting: false }] },
    50: { tick: 50, draws: 15, activeIds: [13, 17, 21, 25], counts: { shape: 4 }, agents: [], projectiles: [], firstEntities: [{ id: 13, kind: 'shape', health: 23.333333, score: 155, x: 53.355471, y: -149.945644, deleting: false }, { id: 17, kind: 'shape', health: 3.333333, score: 180, x: 218.404217, y: -70.355269, deleting: false }, { id: 21, kind: 'shape', health: 35.333333, score: 0, x: -83.055743, y: 276.669705, deleting: false }, { id: 25, kind: 'shape', health: 19.333333, score: 25, x: 94.89063, y: 333.305139, deleting: false }] },
  };
  for (const [tick, expected] of Object.entries(denseExpectations)) assertProjectionMatches('dense-collision', 3, Number(tick), expected);
}


function assertAiMultiTickParity() {
  const expectations = {
    1: [
      { id: 0, x: -82.016571, y: -290.349378, vx: -0.919936, vy: -1.340745, targetId: 1, moveX: -0.543992, moveY: 0.83909 },
      { id: 1, x: -296.195436, y: 43.119603, vx: 0.51026, vy: -0.752281, targetId: 0, moveX: 0.543992, moveY: -0.83909 },
    ],
    10: [
      { id: 0, x: -56.832797, y: -329.381618, vx: 4.516638, vy: -5.392472, targetId: 1, moveX: -0.593865, moveY: 0.804565 },
      { id: 1, x: -336.654495, y: 38.511286, vx: -6.693834, vy: -0.291449, targetId: 0, moveX: 0.593865, moveY: -0.804565 },
    ],
    50: [
      { id: 0, x: 229.78597, y: -668.324409, vx: 7.400128, vy: -8.0681, targetId: 1, moveX: -0.8194, moveY: 0.573222 },
      { id: 1, x: -764.581019, y: 21.957068, vx: -10.344374, vy: -0.461744, targetId: 0, moveX: 0.8194, moveY: -0.573222 },
    ],
  };
  for (const [tick, expected] of Object.entries(expectations)) {
    const snap = snapshot([`--seed=123`, '--agents=2', `--ticks=${tick}`, '--scenario=basic-ai-parity']);
    assert.deepEqual(byKind(snap, 'agent').map((entity) => ({
      id: entity.id,
      x: round(entity.position.x),
      y: round(entity.position.y),
      vx: round(entity.velocity.x),
      vy: round(entity.velocity.y),
      targetId: entity.ai.targetId,
      moveX: round(entity.ai.movement.x),
      moveY: round(entity.ai.movement.y),
    })), expected, `basic-ai-parity tick ${tick}`);
  }
}

function assertCrasherMovementParity() {
  const expectations = {
    0: { draws: 9, id: 3, x: 259.998792, y: 239.647139, vx: -1.094483, vy: -1.025723, movementAngle: 3.894571 },
    1: { draws: 9, id: 3, x: 258.904309, y: 238.621416, vx: -0.985035, vy: -0.92315, movementAngle: 3.894571 },
    10: { draws: 9, id: 3, x: 252.870188, y: 232.966387, vx: -0.381623, vy: -0.357647, movementAngle: 3.894571 },
    50: { draws: 9, id: 3, x: 249.1236, y: 229.455177, vx: 0, vy: 0, movementAngle: 3.894571 },
  };
  for (const [tick, expected] of Object.entries(expectations)) {
    const snap = snapshot([`--seed=123`, '--agents=0', `--ticks=${tick}`, '--scenario=shape-spawn-parity']);
    const crasher = snap.entities.find((entity) => entity.kind === 'crasher');
    assert.deepEqual({
      draws: snap.rng.draws,
      id: crasher.id,
      x: round(crasher.position.x),
      y: round(crasher.position.y),
      vx: round(crasher.velocity.x),
      vy: round(crasher.velocity.y),
      movementAngle: round(crasher.projectile.movementAngle),
    }, expected, `crasher deterministic movement tick ${tick}`);
  }
}

function assertBasicAiParity() {
  const snap = snapshot(['--seed=123', '--agents=2', '--ticks=1', '--scenario=basic-ai-parity']);
  const a0 = agentByIndex(snap, 0);
  const a1 = agentByIndex(snap, 1);
  assert.equal(a0.ai.state, 1);
  assert.equal(a1.ai.state, 1);
  assert.equal(a0.ai.targetId, a1.id);
  assert.equal(a1.ai.targetId, a0.id);
  assert.equal(a0.ai.flags, 1);
  assert.equal(a1.ai.flags, 1);
  assert.ok(Math.abs(Math.hypot(a0.ai.movement.x, a0.ai.movement.y) - 1) < 0.00001);
}

assertBasicTankParity();
assertBulletParity();
assertDynamicBulletParity();
assertShapeParity();
assertShapeManagerParity();
assertBasicAiParity();
assertMultiTickParity();
assertCollisionLifetimeParity();
assertAiMultiTickParity();
assertCrasherMovementParity();
console.log('headless constructor parity gates matched TypeScript definitions');
