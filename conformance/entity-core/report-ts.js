#!/usr/bin/env node
const path = require('node:path');
require(path.join(__dirname, '../../test/helpers/register-ts'));

const Writer = require('../../src/Coder/Writer').default;
const { Entity } = require('../../src/Native/Entity');
const EntityManager = require('../../src/Native/Manager').default;
const ObjectEntity = require('../../src/Entity/Object').default;
const { CameraEntity } = require('../../src/Native/Camera');
const { NameGroup, ScoreGroup, HealthGroup, BarrelGroup } = require('../../src/Native/FieldGroups');
const { compileCreation, compileUpdate } = require('../../src/Native/UpcreateCompiler');
const { CameraFlags, Color, PhysicsFlags, PositionFlags } = require('../../src/Const/Enums');

const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const state = (group) => Array.from(group.state);
const tableState = (table) => Array.from(table.state);
const ids = (items) => items.slice();

function createGame() {
  const game = { tick: 0, arena: null, entities: null };
  game.entities = new EntityManager(game);
  return game;
}

function entitySummary(entity) {
  return {
    className: entity.constructor.name,
    id: entity.id,
    hash: entity.hash,
    preservedHash: entity.preservedHash,
    entityState: entity.entityState,
    exists: Entity.exists(entity),
    string: entity.toString(),
    primitive: Number(entity)
  };
}

function managerLifecycleReport() {
  const game = createGame();
  const plain = new Entity(game);
  const object = new ObjectEntity(game);
  const camera = new CameraEntity(game);
  const beforeDelete = {
    lastId: game.entities.lastId,
    zIndex: game.entities.zIndex,
    cameras: ids(game.entities.cameras),
    otherEntities: ids(game.entities.otherEntities),
    hashTable: Array.from(game.entities.hashTable.slice(0, 4)),
    plain: entitySummary(plain),
    object: entitySummary(object),
    camera: entitySummary(camera)
  };

  object.delete();
  const replacement = new ObjectEntity(game);
  const afterReuse = {
    lastId: game.entities.lastId,
    zIndex: game.entities.zIndex,
    cameras: ids(game.entities.cameras),
    otherEntities: ids(game.entities.otherEntities),
    deletedObject: entitySummary(object),
    replacement: entitySummary(replacement),
    hashTable: Array.from(game.entities.hashTable.slice(0, 4)),
    innerPresent: game.entities.inner.slice(0, 4).map((entity) => entity ? entity.constructor.name : null)
  };

  game.entities.clear();
  const afterClear = {
    lastId: game.entities.lastId,
    cameras: ids(game.entities.cameras),
    otherEntities: ids(game.entities.otherEntities),
    hashTable: Array.from(game.entities.hashTable.slice(0, 4)),
    plain: entitySummary(plain),
    camera: entitySummary(camera),
    replacement: entitySummary(replacement)
  };

  return { beforeDelete, afterReuse, afterClear };
}

function fieldGroupReport() {
  const game = createGame();
  const object = new ObjectEntity(game);
  object.nameData = new NameGroup(object);
  object.scoreData = new ScoreGroup(object);
  object.healthData = new HealthGroup(object);
  object.barrelData = new BarrelGroup(object);

  const defaults = {
    relations: { state: state(object.relationsData), values: { parent: object.relationsData.values.parent, owner: object.relationsData.values.owner, team: object.relationsData.values.team } },
    physics: { state: state(object.physicsData), values: { ...object.physicsData.values } },
    position: { state: state(object.positionData), values: { ...object.positionData.values } },
    style: { state: state(object.styleData), values: { ...object.styleData.values } },
    name: { state: state(object.nameData), values: { ...object.nameData.values } },
    health: { state: state(object.healthData), values: { ...object.healthData.values } }
  };

  object.physicsData.sides = 3;
  object.physicsData.sides = 3;
  object.physicsData.size = 42.5;
  object.physicsData.flags = PhysicsFlags.isBase | PhysicsFlags.noOwnTeamCollision;
  object.positionData.x = -120;
  object.positionData.y = 80;
  object.positionData.angle = Math.PI / 4;
  object.positionData.flags = PositionFlags.absoluteRotation;
  object.styleData.color = Color.Tank;
  object.styleData.opacity = 0.75;
  object.nameData.name = 'Phase C Δ';
  object.scoreData.score = 12345;
  object.healthData.health = 0.5;
  object.healthData.maxHealth = 2;
  object.barrelData.reloadTime = 22;
  object.relationsData.owner = object;
  object.relationsData.team = object;

  const afterMutations = {
    entityState: object.entityState,
    relations: { state: state(object.relationsData), ownerId: object.relationsData.values.owner.id, teamId: object.relationsData.values.team.id },
    physics: { state: state(object.physicsData), values: { ...object.physicsData.values } },
    position: { state: state(object.positionData), values: { ...object.positionData.values } },
    style: { state: state(object.styleData), values: { ...object.styleData.values } },
    name: { state: state(object.nameData), values: { ...object.nameData.values } },
    score: { state: state(object.scoreData), values: { ...object.scoreData.values } },
    health: { state: state(object.healthData), values: { ...object.healthData.values } },
    barrel: { state: state(object.barrelData), values: { ...object.barrelData.values } }
  };

  object.wipeState();
  const afterWipe = {
    entityState: object.entityState,
    relations: state(object.relationsData),
    physics: state(object.physicsData),
    position: state(object.positionData),
    style: state(object.styleData),
    name: state(object.nameData),
    score: state(object.scoreData),
    health: state(object.healthData),
    barrel: state(object.barrelData),
    valuesPersist: {
      x: object.positionData.values.x,
      y: object.positionData.values.y,
      size: object.physicsData.values.size,
      name: object.nameData.values.name,
      score: object.scoreData.values.score
    }
  };

  const camera = new CameraEntity(game);
  camera.cameraData.statNames[0] = 'Reload';
  camera.cameraData.statLevels[0] = 4;
  camera.cameraData.statLimits[0] = 7;
  const cameraTable = {
    entityState: camera.entityState,
    cameraState: state(camera.cameraData),
    statNamesState: tableState(camera.cameraData.statNames),
    statLevelsState: tableState(camera.cameraData.statLevels),
    statLimitsState: tableState(camera.cameraData.statLimits),
    values: {
      statName0: camera.cameraData.statNames[0],
      statLevel0: camera.cameraData.statLevels[0],
      statLimit0: camera.cameraData.statLimits[0]
    }
  };
  camera.wipeState();
  cameraTable.afterWipe = {
    entityState: camera.entityState,
    cameraState: state(camera.cameraData),
    statNamesState: tableState(camera.cameraData.statNames),
    statLevelsState: tableState(camera.cameraData.statLevels),
    statLimitsState: tableState(camera.cameraData.statLimits)
  };

  return { defaults, afterMutations, afterWipe, cameraTable };
}

function cameraFollowReport() {
  const game = createGame();
  const player = new ObjectEntity(game);
  const camera = new CameraEntity(game);
  player.positionData.x = 321;
  player.positionData.y = -222;
  camera.cameraData.player = player;
  camera.tick(10);
  const followsPlayer = {
    cameraX: camera.cameraData.values.cameraX,
    cameraY: camera.cameraData.values.cameraY,
    flags: camera.cameraData.values.flags,
    cameraState: state(camera.cameraData)
  };
  camera.wipeState();
  player.delete();
  camera.tick(11);
  return {
    followsPlayer,
    missingPlayer: {
      flags: camera.cameraData.values.flags,
      usesCameraCoords: (camera.cameraData.values.flags & CameraFlags.usesCameraCoords) !== 0,
      cameraState: state(camera.cameraData)
    }
  };
}


function ref(entity) {
  return Entity.exists(entity) ? { id: entity.id, hash: entity.hash } : null;
}

function groupSnapshot(entity) {
  const snapshot = {};
  if (entity.relationsData) {
    snapshot.relations = {
      state: state(entity.relationsData),
      parent: ref(entity.relationsData.values.parent),
      owner: ref(entity.relationsData.values.owner),
      team: ref(entity.relationsData.values.team)
    };
  }
  if (entity.physicsData) {
    snapshot.physics = { state: state(entity.physicsData), values: { ...entity.physicsData.values } };
  }
  if (entity.positionData) {
    snapshot.position = { state: state(entity.positionData), values: { ...entity.positionData.values } };
  }
  if (entity.styleData) {
    snapshot.style = { state: state(entity.styleData), values: { ...entity.styleData.values } };
  }
  if (entity.nameData) {
    snapshot.name = { state: state(entity.nameData), values: { ...entity.nameData.values } };
  }
  if (entity.healthData) {
    snapshot.health = { state: state(entity.healthData), values: { ...entity.healthData.values } };
  }
  if (entity.scoreData) {
    snapshot.score = { state: state(entity.scoreData), values: { ...entity.scoreData.values } };
  }
  if (entity.barrelData) {
    snapshot.barrel = { state: state(entity.barrelData), values: { ...entity.barrelData.values } };
  }
  return snapshot;
}

function worldEntitySnapshot(entity) {
  return {
    ...entitySummary(entity),
    groups: groupSnapshot(entity)
  };
}

function fullWorldSnapshotReport() {
  const game = createGame();
  game.tick = 77;

  const player = new ObjectEntity(game);
  player.nameData = new NameGroup(player);
  player.scoreData = new ScoreGroup(player);
  player.healthData = new HealthGroup(player);
  player.barrelData = new BarrelGroup(player);
  player.positionData.x = 125.5;
  player.positionData.y = -64.25;
  player.positionData.angle = Math.PI / 3;
  player.physicsData.sides = 1;
  player.physicsData.size = 35;
  player.physicsData.width = 12;
  player.styleData.color = Color.Tank;
  player.styleData.opacity = 0.9;
  player.nameData.name = 'RL Player';
  player.scoreData.score = 9001;
  player.healthData.health = 0.875;
  player.healthData.maxHealth = 1.25;
  player.barrelData.reloadTime = 12;
  player.relationsData.owner = player;
  player.relationsData.team = player;

  const shape = new ObjectEntity(game);
  shape.positionData.x = -250;
  shape.positionData.y = 100;
  shape.positionData.angle = -Math.PI / 8;
  shape.physicsData.sides = 4;
  shape.physicsData.size = 30;
  shape.physicsData.width = 30;
  shape.styleData.color = Color.EnemySquare;
  shape.relationsData.owner = player;
  shape.relationsData.team = null;

  const deleted = new ObjectEntity(game);
  deleted.positionData.x = 999;
  deleted.delete();

  return {
    purpose: 'primary Phase C parity target: full world/entity state for headless RL training',
    tick: game.tick,
    lastId: game.entities.lastId,
    zIndex: game.entities.zIndex,
    activeIds: game.entities.inner
      .slice(0, game.entities.lastId + 1)
      .map((entity, id) => Entity.exists(entity) ? id : null)
      .filter((id) => id !== null),
    hashTable: Array.from(game.entities.hashTable.slice(0, 4)),
    entities: game.entities.inner
      .slice(0, game.entities.lastId + 1)
      .filter((entity) => Entity.exists(entity))
      .map(worldEntitySnapshot)
  };
}

function compilerReport() {
  const game = createGame();
  const camera = new CameraEntity(game);
  const object = new ObjectEntity(game);
  object.nameData = new NameGroup(object);
  object.scoreData = new ScoreGroup(object);
  object.healthData = new HealthGroup(object);
  object.barrelData = new BarrelGroup(object);

  object.physicsData.sides = 3;
  object.physicsData.size = 42.5;
  object.physicsData.width = 17;
  object.physicsData.flags = PhysicsFlags.noOwnTeamCollision;
  object.positionData.x = -120;
  object.positionData.y = 80;
  object.positionData.angle = Math.PI / 4;
  object.styleData.color = Color.Tank;
  object.styleData.opacity = 0.75;
  object.nameData.name = 'Phase C Δ';
  object.scoreData.score = 12345;
  object.healthData.health = 0.5;
  object.healthData.maxHealth = 2;
  object.barrelData.reloadTime = 22;
  object.relationsData.owner = object;
  object.relationsData.team = object;
  camera.cameraData.player = object;

  const creationWriter = new Writer();
  compileCreation(camera, creationWriter, object);
  const creationHex = toHex(creationWriter.write(true));

  object.wipeState();
  object.positionData.x = -100;
  object.positionData.y = 90;
  object.physicsData.size = 50;
  object.styleData.opacity = 0.5;
  object.healthData.health = 0.25;
  object.nameData.name = 'Phase C Ω';
  const updateState = {
    position: state(object.positionData),
    physics: state(object.physicsData),
    style: state(object.styleData),
    health: state(object.healthData),
    name: state(object.nameData),
    entityState: object.entityState
  };
  const updateWriter = new Writer();
  compileUpdate(camera, updateWriter, object);
  const updateHex = toHex(updateWriter.write(true));

  return {
    ids: { camera: entitySummary(camera), object: entitySummary(object) },
    creationHex,
    updateState,
    updateHex
  };
}

process.stdout.write(`${JSON.stringify({ world: fullWorldSnapshotReport(), manager: managerLifecycleReport(), fields: fieldGroupReport(), compatibility: { camera: cameraFollowReport(), compiler: compilerReport() } }, null, 2)}\n`);
