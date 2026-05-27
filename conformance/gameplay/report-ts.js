#!/usr/bin/env node
const path = require('node:path');
require(path.join(__dirname, '../../test/helpers/register-ts'));

const EntityManager = require('../../src/Native/Manager').default;
const LivingEntity = require('../../src/Entity/Live').default;
const { Entity } = require('../../src/Native/Entity');
const { ArenaGroup } = require('../../src/Native/FieldGroups');
const { Color } = require('../../src/Const/Enums');

function createHeadlessGame() {
  const game = {
    tick: 0,
    clients: new Set(),
    clientsAwaitingSpawn: new Map(),
    playersOnMap: false,
    gamemode: 'phase-d-headless',
    name: 'Phase D Headless',
    broadcast() {
      return { vu() { return this; }, send() {} };
    },
    broadcastPlayerCount() {},
    broadcastMessage() {}
  };
  game.entities = new EntityManager(game);
  const arenaOwner = { entityState: 0 };
  const arenaData = new ArenaGroup(arenaOwner);
  arenaData.values.leftX = -1000;
  arenaData.values.rightX = 1000;
  arenaData.values.topY = -1000;
  arenaData.values.bottomY = 1000;
  // The Phase D fixture is intentionally headless and manager-focused.
  // Keep only the arena bounds that ObjectEntity.keepInArena needs; do not
  // register an ArenaEntity, because ArenaEntity.tick drives countdown,
  // shape, and boss managers that are out of scope for this first slice.
  game.arena = { id: null, hash: 0, state: 'headless-fixture', ARENA_PADDING: 200, arenaData };
  return game;
}

function makeDamageBody(game, name, { x, y, health, maxHealth, damagePerTick, size, color }) {
  const body = new LivingEntity(game);
  body.positionData.x = x;
  body.positionData.y = y;
  body.positionData.angle = 0;
  body.physicsData.sides = 1;
  body.physicsData.size = size;
  body.physicsData.width = size;
  body.physicsData.absorbtionFactor = 1;
  body.physicsData.pushFactor = 8;
  body.healthData.health = health;
  body.healthData.maxHealth = maxHealth;
  body.styleData.color = color;
  body.damagePerTick = damagePerTick;
  body.scoreReward = 0;
  body.fixtureName = name;
  return body;
}

function round(value) {
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(6));
}

function entityRef(entity) {
  return Entity.exists(entity) ? { id: entity.id, hash: entity.hash } : null;
}

function objectSnapshot(entity) {
  const snapshot = {
    id: entity.id,
    hash: entity.hash,
    preservedHash: entity.preservedHash,
    className: entity.constructor.name,
    fixtureName: entity.fixtureName || null,
    exists: Entity.exists(entity),
    entityState: entity.entityState
  };

  if (entity.relationsData) {
    snapshot.relations = {
      parent: entityRef(entity.relationsData.values.parent),
      owner: entityRef(entity.relationsData.values.owner),
      team: entityRef(entity.relationsData.values.team)
    };
  }
  if (entity.positionData) {
    snapshot.position = {
      x: round(entity.positionData.values.x),
      y: round(entity.positionData.values.y),
      angle: round(entity.positionData.values.angle),
      flags: entity.positionData.values.flags
    };
  }
  if (entity.physicsData) {
    snapshot.physics = {
      sides: entity.physicsData.values.sides,
      size: round(entity.physicsData.values.size),
      width: round(entity.physicsData.values.width),
      pushFactor: round(entity.physicsData.values.pushFactor),
      absorbtionFactor: round(entity.physicsData.values.absorbtionFactor),
      flags: entity.physicsData.values.flags
    };
  }
  if (entity.healthData) {
    snapshot.health = {
      health: round(entity.healthData.values.health),
      maxHealth: round(entity.healthData.values.maxHealth),
      flags: entity.healthData.values.flags
    };
    snapshot.damage = {
      damagePerTick: round(entity.damagePerTick),
      damageReduction: round(entity.damageReduction),
      minDamageMultiplier: round(entity.minDamageMultiplier),
      maxDamageMultiplier: round(entity.maxDamageMultiplier),
      lastDamageTick: entity.lastDamageTick
    };
  }
  if (entity.styleData) {
    snapshot.style = {
      color: entity.styleData.values.color,
      opacity: round(entity.styleData.values.opacity),
      flags: entity.styleData.values.flags
    };
  }
  if (entity.velocity) {
    snapshot.velocity = {
      x: round(entity.velocity.x),
      y: round(entity.velocity.y),
      magnitude: round(entity.velocity.magnitude),
      angle: round(entity.velocity.angle)
    };
  }
  return snapshot;
}

function worldSnapshot(game, label) {
  const active = [];
  for (let id = 0; id <= game.entities.lastId; id += 1) {
    const entity = game.entities.inner[id];
    if (entity) active.push(objectSnapshot(entity));
  }

  return {
    label,
    tick: game.tick,
    manager: {
      lastId: game.entities.lastId,
      activeIds: active.map((entity) => entity.id),
      cameras: game.entities.cameras.slice(),
      otherEntities: game.entities.otherEntities.slice(),
      globalEntities: game.entities.globalEntities.slice(),
      hashTable: Array.from(game.entities.hashTable.slice(0, game.entities.lastId + 1))
    },
    arena: {
      id: game.arena.id,
      state: game.arena.state,
      bounds: {
        leftX: round(game.arena.arenaData.values.leftX),
        rightX: round(game.arena.arenaData.values.rightX),
        topY: round(game.arena.arenaData.values.topY),
        bottomY: round(game.arena.arenaData.values.bottomY)
      }
    },
    entities: active
  };
}

function tickHeadless(game) {
  game.tick += 1;
  game.entities.preTick(game.tick);
  game.entities.tick(game.tick);
  game.entities.postTick(game.tick);
}

function damageScenario() {
  const game = createHeadlessGame();
  const attacker = makeDamageBody(game, 'attacker', {
    x: 0,
    y: 0,
    health: 50,
    maxHealth: 50,
    damagePerTick: 3,
    size: 30,
    color: Color.Tank
  });
  const defender = makeDamageBody(game, 'defender', {
    x: 35,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 1,
    size: 30,
    color: Color.EnemySquare
  });

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-1-damage-tick'));
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-2-damage-ticks'));

  return {
    scenario: 'overlapping-living-entities-damage',
    invariant: 'Two overlapping living entities with different damage values exchange deterministic collision damage during headless manager ticks.',
    participants: {
      attacker: entityRef(attacker),
      defender: entityRef(defender)
    },
    damageEvidence: {
      attackerInitialHealth: snapshots[0].entities.find((e) => e.fixtureName === 'attacker').health.health,
      attackerFinalHealth: snapshots[2].entities.find((e) => e.fixtureName === 'attacker').health.health,
      defenderInitialHealth: snapshots[0].entities.find((e) => e.fixtureName === 'defender').health.health,
      defenderFinalHealth: snapshots[2].entities.find((e) => e.fixtureName === 'defender').health.health
    },
    snapshots
  };
}

function report() {
  return {
    phase: 'D-gameplay',
    scope: 'minimal-headless-tick-parity',
    nonGoals: [
      'browser-client-ui-testing',
      'per-agent-rl-observation-grids',
      'cpp-gameplay-implementation',
      'full-live-websocket-gameplay-parity',
      'broad-every-tank-projectile-upgrade-coverage'
    ],
    scenarios: [damageScenario()]
  };
}

process.stdout.write(`${JSON.stringify(report(), null, 2)}\n`);
