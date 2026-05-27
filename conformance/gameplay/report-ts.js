#!/usr/bin/env node
const path = require('node:path');
require(path.join(__dirname, '../../test/helpers/register-ts'));

const EntityManager = require('../../src/Native/Manager').default;
const LivingEntity = require('../../src/Entity/Live').default;
const { CameraEntity } = require('../../src/Native/Camera');
const { Entity } = require('../../src/Native/Entity');
const { ArenaGroup, ScoreGroup } = require('../../src/Native/FieldGroups');
const { Color, PhysicsFlags } = require('../../src/Const/Enums');

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
  body.fixtureScore = 0;
  body.onKill = function onFixtureKill(entity) {
    this.fixtureScore += entity.scoreReward;
  };
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
  if (entity.cameraData) {
    snapshot.camera = {
      player: entityRef(entity.cameraData.values.player),
      score: round(entity.cameraData.values.score),
      level: entity.cameraData.values.level,
      levelbarProgress: round(entity.cameraData.values.levelbarProgress),
      levelbarMax: round(entity.cameraData.values.levelbarMax),
      statsAvailable: entity.cameraData.values.statsAvailable
    };
  }
  if (entity.scoreData) {
    snapshot.score = {
      score: round(entity.scoreData.values.score)
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
  if (typeof entity.fixtureScore === 'number') {
    snapshot.gameplay = {
      score: round(entity.fixtureScore),
      scoreReward: round(entity.scoreReward),
      deleting: Boolean(entity.deletionAnimation),
      deletionFrame: entity.deletionAnimation ? entity.deletionAnimation.frame : null
    };
    if (entity.fixtureProjectile) {
      snapshot.gameplay.projectile = {
        spawnTick: entity.fixtureProjectile.spawnTick,
        baseSpeed: round(entity.fixtureProjectile.baseSpeed),
        baseAccel: round(entity.fixtureProjectile.baseAccel),
        lifeLength: entity.fixtureProjectile.lifeLength,
        movementAngle: round(entity.fixtureProjectile.movementAngle)
      };
    }
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

function findEntity(snap, name) {
  return snap.entities.find((entity) => entity.fixtureName === name);
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
      attackerInitialHealth: findEntity(snapshots[0], 'attacker').health.health,
      attackerFinalHealth: findEntity(snapshots[2], 'attacker').health.health,
      defenderInitialHealth: findEntity(snapshots[0], 'defender').health.health,
      defenderFinalHealth: findEntity(snapshots[2], 'defender').health.health
    },
    snapshots
  };
}


function scoreDeathScenario() {
  const game = createHeadlessGame();
  const killer = makeDamageBody(game, 'killer', {
    x: 0,
    y: 0,
    health: 60,
    maxHealth: 60,
    damagePerTick: 12,
    size: 30,
    color: Color.Tank
  });
  const victim = makeDamageBody(game, 'victim', {
    x: 35,
    y: 0,
    health: 5,
    maxHealth: 5,
    damagePerTick: 0.5,
    size: 30,
    color: Color.EnemySquare
  });
  victim.scoreReward = 17;

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-kill-damage-tick'));
  for (let i = 0; i < 6; i += 1) tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-deletion-animation-removal'));

  return {
    scenario: 'score-on-kill-and-death-removal',
    invariant: 'A lethal deterministic collision calls the killer onKill hook once, awards the victim scoreReward, starts death animation, and removes the victim after the deletion animation completes.',
    participants: {
      killer: entityRef(killer),
      victimAfterRemoval: entityRef(victim)
    },
    scoreEvidence: {
      killerInitialScore: findEntity(snapshots[0], 'killer').gameplay.score,
      killerScoreAfterKill: findEntity(snapshots[1], 'killer').gameplay.score,
      victimScoreReward: findEntity(snapshots[0], 'victim').gameplay.scoreReward,
      victimHealthAfterKill: findEntity(snapshots[1], 'victim').health.health,
      victimPresentAfterRemoval: Boolean(findEntity(snapshots[2], 'victim'))
    },
    snapshots
  };
}

function ownerPropagatedKillScenario() {
  const game = createHeadlessGame();
  const owner = makeDamageBody(game, 'owner', {
    x: -200,
    y: 0,
    health: 80,
    maxHealth: 80,
    damagePerTick: 0,
    size: 25,
    color: Color.Tank
  });
  owner.isPhysical = false;

  const projectile = makeDamageBody(game, 'projectile', {
    x: 0,
    y: 0,
    health: 10,
    maxHealth: 10,
    damagePerTick: 12,
    size: 20,
    color: Color.Tank
  });
  projectile.relationsData.owner = owner;
  projectile.onKill = function onProjectileKill(entity) {
    this.relationsData.values.owner?.onKill?.(entity);
  };

  const target = makeDamageBody(game, 'target', {
    x: 25,
    y: 0,
    health: 5,
    maxHealth: 5,
    damagePerTick: 0.25,
    size: 20,
    color: Color.EnemySquare
  });
  target.scoreReward = 23;

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-projectile-kill-tick'));

  return {
    scenario: 'owner-propagated-projectile-kill-score',
    invariant: 'A projectile-style living entity propagates its onKill event to its owner, awarding the target scoreReward to the owner instead of retaining it on the projectile.',
    participants: {
      owner: entityRef(owner),
      projectile: entityRef(projectile),
      target: entityRef(target)
    },
    scoreEvidence: {
      ownerInitialScore: findEntity(snapshots[0], 'owner').gameplay.score,
      ownerScoreAfterKill: findEntity(snapshots[1], 'owner').gameplay.score,
      projectileScoreAfterKill: findEntity(snapshots[1], 'projectile').gameplay.score,
      targetScoreReward: findEntity(snapshots[0], 'target').gameplay.scoreReward,
      targetHealthAfterKill: findEntity(snapshots[1], 'target').health.health,
      projectileOwnerRef: findEntity(snapshots[0], 'projectile').relations.owner
    },
    snapshots
  };
}

function projectileMovementLifetimeScenario() {
  const game = createHeadlessGame();
  const projectile = makeDamageBody(game, 'lifetime-projectile', {
    x: 0,
    y: 0,
    health: 10,
    maxHealth: 10,
    damagePerTick: 0,
    size: 12,
    color: Color.Tank
  });
  projectile.physicsData.flags = 16; // Existing TS projectile fixture flag; movement remains inside bounds, so this slice stays focused on lifetime motion.
  projectile.fixtureProjectile = {
    spawnTick: game.tick,
    baseSpeed: 6,
    baseAccel: 2,
    lifeLength: 3,
    movementAngle: Math.PI / 4
  };
  projectile.tick = function tickFixtureProjectile(tick) {
    LivingEntity.prototype.tick.call(this, tick);
    const { spawnTick, baseSpeed, baseAccel, lifeLength, movementAngle } = this.fixtureProjectile;
    if (tick === spawnTick + 1) this.addVelocity(movementAngle, baseSpeed);
    else this.maintainVelocity(movementAngle, baseAccel);
    if (tick - spawnTick >= lifeLength) this.destroy(true);
  };

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  for (let i = 0; i < 4; i += 1) {
    tickHeadless(game);
    snapshots.push(worldSnapshot(game, `after-projectile-tick-${game.tick}`));
  }

  return {
    scenario: 'projectile-movement-and-lifetime',
    invariant: 'A projectile-style entity applies spawn speed on its first tick, maintains acceleration on later ticks, and starts deletion once its lifetime expires.',
    participants: {
      projectile: entityRef(projectile)
    },
    movementEvidence: {
      initialPosition: findEntity(snapshots[0], 'lifetime-projectile').position,
      firstTickVelocity: findEntity(snapshots[1], 'lifetime-projectile').velocity,
      secondTickPosition: findEntity(snapshots[2], 'lifetime-projectile').position,
      deletionStartedAtLifetime: findEntity(snapshots[3], 'lifetime-projectile').gameplay.deleting,
      deletionFrameAfterNextTick: findEntity(snapshots[4], 'lifetime-projectile').gameplay.deletionFrame
    },
    snapshots
  };
}

function cameraScoreIntegrationScenario() {
  const game = createHeadlessGame();
  const player = makeDamageBody(game, 'score-player', {
    x: 0,
    y: 0,
    health: 30,
    maxHealth: 30,
    damagePerTick: 0,
    size: 25,
    color: Color.Tank
  });
  player.scoreData = new ScoreGroup(player);
  const camera = new CameraEntity(game);
  camera.fixtureName = 'score-camera';
  camera.cameraData.player = player;

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  camera.addScore(15);
  snapshots.push(worldSnapshot(game, 'after-camera-add-score'));
  camera.setScore(7);
  snapshots.push(worldSnapshot(game, 'after-camera-set-score'));

  return {
    scenario: 'camera-player-score-integration',
    invariant: 'Camera score mutations mirror onto the focused player score field, preserving the score source used by tank/camera gameplay integration.',
    participants: {
      player: entityRef(player),
      camera: entityRef(camera)
    },
    scoreEvidence: {
      initialCameraScore: findEntity(snapshots[0], 'score-camera').camera.score,
      initialPlayerScore: findEntity(snapshots[0], 'score-player').score.score,
      cameraScoreAfterAdd: findEntity(snapshots[1], 'score-camera').camera.score,
      playerScoreAfterAdd: findEntity(snapshots[1], 'score-player').score.score,
      cameraScoreAfterSet: findEntity(snapshots[2], 'score-camera').camera.score,
      playerScoreAfterSet: findEntity(snapshots[2], 'score-player').score.score,
      cameraPlayerRef: findEntity(snapshots[0], 'score-camera').camera.player
    },
    snapshots
  };
}

function arenaBoundsClampScenario() {
  const game = createHeadlessGame();
  const clamped = makeDamageBody(game, 'bounds-clamped', {
    x: 1300,
    y: -1300,
    health: 10,
    maxHealth: 10,
    damagePerTick: 0,
    size: 20,
    color: Color.Tank
  });
  const escaping = makeDamageBody(game, 'bounds-escaping', {
    x: 1300,
    y: -900,
    health: 10,
    maxHealth: 10,
    damagePerTick: 0,
    size: 20,
    color: Color.EnemySquare
  });
  escaping.physicsData.flags = PhysicsFlags.canEscapeArena

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-bounds-tick'));

  return {
    scenario: 'arena-bounds-clamp-and-can-escape',
    invariant: 'Physical entities without canEscapeArena clamp to arena bounds plus padding, while canEscapeArena entities keep their out-of-bounds position.',
    participants: {
      clamped: entityRef(clamped),
      escaping: entityRef(escaping)
    },
    boundsEvidence: {
      initialClampedPosition: findEntity(snapshots[0], 'bounds-clamped').position,
      clampedAfterTick: findEntity(snapshots[1], 'bounds-clamped').position,
      escapingAfterTick: findEntity(snapshots[1], 'bounds-escaping').position
    },
    snapshots
  };
}

function teamOwnerCollisionRulesScenario() {
  const game = createHeadlessGame();
  const noOwnA = makeDamageBody(game, 'no-own-team-a', {
    x: -300,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const noOwnB = makeDamageBody(game, 'no-own-team-b', {
    x: -275,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  noOwnA.physicsData.flags = PhysicsFlags.noOwnTeamCollision;

  const onlyDifferentOwnerA = makeDamageBody(game, 'only-different-owner-a', {
    x: 0,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const onlyDifferentOwnerB = makeDamageBody(game, 'only-different-owner-b', {
    x: 25,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  onlyDifferentOwnerA.physicsData.flags = PhysicsFlags.onlySameOwnerCollision;
  onlyDifferentOwnerA.relationsData.owner = noOwnA;
  onlyDifferentOwnerB.relationsData.owner = noOwnB;

  const sharedOwner = makeDamageBody(game, 'shared-owner', {
    x: 280,
    y: 80,
    health: 20,
    maxHealth: 20,
    damagePerTick: 0,
    size: 10,
    color: Color.Tank
  });
  sharedOwner.isPhysical = false;
  const onlySameOwnerA = makeDamageBody(game, 'only-same-owner-a', {
    x: 280,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const onlySameOwnerB = makeDamageBody(game, 'only-same-owner-b', {
    x: 305,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  onlySameOwnerA.physicsData.flags = PhysicsFlags.onlySameOwnerCollision;
  onlySameOwnerA.relationsData.owner = sharedOwner;
  onlySameOwnerB.relationsData.owner = sharedOwner;

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-collision-rules-tick'));

  return {
    scenario: 'team-owner-collision-rules',
    invariant: 'Same-team noOwnTeamCollision pairs do not collide, onlySameOwnerCollision rejects different owners, and onlySameOwnerCollision still permits same-owner collisions.',
    participants: {
      noOwnA: entityRef(noOwnA),
      noOwnB: entityRef(noOwnB),
      onlyDifferentOwnerA: entityRef(onlyDifferentOwnerA),
      onlyDifferentOwnerB: entityRef(onlyDifferentOwnerB),
      sharedOwner: entityRef(sharedOwner),
      onlySameOwnerA: entityRef(onlySameOwnerA),
      onlySameOwnerB: entityRef(onlySameOwnerB)
    },
    collisionEvidence: {
      noOwnPairHealthAfterTick: [findEntity(snapshots[1], 'no-own-team-a').health.health, findEntity(snapshots[1], 'no-own-team-b').health.health],
      differentOwnerPairHealthAfterTick: [findEntity(snapshots[1], 'only-different-owner-a').health.health, findEntity(snapshots[1], 'only-different-owner-b').health.health],
      sameOwnerPairHealthAfterTick: [findEntity(snapshots[1], 'only-same-owner-a').health.health, findEntity(snapshots[1], 'only-same-owner-b').health.health],
      sameOwnerPairVelocityAfterTick: [findEntity(snapshots[1], 'only-same-owner-a').velocity, findEntity(snapshots[1], 'only-same-owner-b').velocity]
    },
    snapshots
  };
}

function collisionEligibilityFiltersScenario() {
  const game = createHeadlessGame();
  const zeroSidesA = makeDamageBody(game, 'zero-sides-a', {
    x: -500,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const zeroSidesB = makeDamageBody(game, 'zero-sides-b', {
    x: -475,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  zeroSidesA.physicsData.sides = 0;

  const nonPhysicalA = makeDamageBody(game, 'nonphysical-a', {
    x: -100,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const nonPhysicalB = makeDamageBody(game, 'nonphysical-b', {
    x: -75,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  nonPhysicalA.isPhysical = false;

  const deletingA = makeDamageBody(game, 'deleting-a', {
    x: 300,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  const deletingB = makeDamageBody(game, 'deleting-b', {
    x: 325,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.EnemySquare
  });
  deletingA.destroy(true);

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-filtered-collision-tick'));

  return {
    scenario: 'collision-eligibility-filters',
    invariant: 'Zero-sided, nonphysical, and actively deleting entities are excluded from collision damage and knockback before geometry checks.',
    participants: {
      zeroSidesA: entityRef(zeroSidesA),
      zeroSidesB: entityRef(zeroSidesB),
      nonPhysicalA: entityRef(nonPhysicalA),
      nonPhysicalB: entityRef(nonPhysicalB),
      deletingA: entityRef(deletingA),
      deletingB: entityRef(deletingB)
    },
    filterEvidence: {
      zeroSidesHealthAfterTick: [findEntity(snapshots[1], 'zero-sides-a').health.health, findEntity(snapshots[1], 'zero-sides-b').health.health],
      nonPhysicalHealthAfterTick: [findEntity(snapshots[1], 'nonphysical-a').health.health, findEntity(snapshots[1], 'nonphysical-b').health.health],
      deletingPairHealthAfterTick: [findEntity(snapshots[1], 'deleting-a').health.health, findEntity(snapshots[1], 'deleting-b').health.health],
      deletingAStateAfterTick: findEntity(snapshots[1], 'deleting-a').gameplay,
      otherVelocitiesAfterTick: [findEntity(snapshots[1], 'zero-sides-b').velocity, findEntity(snapshots[1], 'nonphysical-b').velocity, findEntity(snapshots[1], 'deleting-b').velocity]
    },
    snapshots
  };
}

function solidWallProjectileContactScenario() {
  const game = createHeadlessGame();
  const owner = makeDamageBody(game, 'wall-projectile-owner', {
    x: -650,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 0,
    size: 10,
    color: Color.Tank
  });
  owner.isPhysical = false;

  const projectile = makeDamageBody(game, 'wall-projectile', {
    x: -600,
    y: 0,
    health: 20,
    maxHealth: 20,
    damagePerTick: 5,
    size: 20,
    color: Color.Tank
  });
  projectile.relationsData.owner = owner;

  const wall = makeDamageBody(game, 'solid-wall', {
    x: -575,
    y: 0,
    health: 999,
    maxHealth: 999,
    damagePerTick: 0,
    size: 20,
    color: Color.EnemySquare
  });
  wall.physicsData.flags = PhysicsFlags.isSolidWall;
  wall.relationsData.team = wall;

  const snapshots = [worldSnapshot(game, 'initial-full-world')];
  tickHeadless(game);
  snapshots.push(worldSnapshot(game, 'after-wall-contact-tick'));

  return {
    scenario: 'solid-wall-projectile-contact',
    invariant: 'A projectile-like owned entity touching an enemy solid wall is immediately put into deletion animation without damaging or moving the wall.',
    participants: {
      owner: entityRef(owner),
      projectile: entityRef(projectile),
      wall: entityRef(wall)
    },
    wallEvidence: {
      projectileAfterContact: findEntity(snapshots[1], 'wall-projectile').gameplay,
      projectileVelocityAfterContact: findEntity(snapshots[1], 'wall-projectile').velocity,
      wallHealthAfterContact: findEntity(snapshots[1], 'solid-wall').health.health,
      wallVelocityAfterContact: findEntity(snapshots[1], 'solid-wall').velocity,
      projectileOwnerRef: findEntity(snapshots[0], 'wall-projectile').relations.owner,
      wallTeamRef: findEntity(snapshots[0], 'solid-wall').relations.team
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
    scenarios: [damageScenario(), scoreDeathScenario(), ownerPropagatedKillScenario(), projectileMovementLifetimeScenario(), cameraScoreIntegrationScenario(), arenaBoundsClampScenario(), teamOwnerCollisionRulesScenario(), collisionEligibilityFiltersScenario(), solidWallProjectileContactScenario()]
  };
}

process.stdout.write(`${JSON.stringify(report(), null, 2)}\n`);
