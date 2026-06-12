const assert = require('node:assert/strict');
const test = require('node:test');
require('../helpers/register-ts');

const Vector = require('../../src/Physics/Vector').default;
const { AIState } = require('../../src/Entity/AI');
const { applyIdleSpinOrTrackTarget } = require('../../src/Entity/Boss/aim');
const { getAutoSizedArenaDimension } = require('../../src/Gamemodes/Misc/common');
const { removeFast, constrain, normalizeAngle, PI2 } = require('../../src/util');

test('removeFast removes the indexed element without preserving order', () => {
  const values = ['a', 'b', 'c', 'd'];
  removeFast(values, 1);
  assert.deepEqual(values, ['a', 'd', 'c']);

  removeFast(values, values.length - 1);
  assert.deepEqual(values, ['a', 'd']);
});

test('removeFast rejects out-of-range indexes', () => {
  assert.throws(() => removeFast([1, 2, 3], -1), /Index out of range/);
  assert.throws(() => removeFast([1, 2, 3], 3), /Index out of range/);
});

test('constrain clamps values and normalizeAngle wraps into [0, 2π)', () => {
  assert.equal(constrain(-10, 0, 5), 0);
  assert.equal(constrain(3, 0, 5), 3);
  assert.equal(constrain(10, 0, 5), 5);

  assert.equal(normalizeAngle(0), 0);
  assert.ok(Math.abs(normalizeAngle(PI2 * 3 + Math.PI / 3) - Math.PI / 3) < 1e-12);
  assert.ok(Math.abs(normalizeAngle(-Math.PI / 2) - (PI2 - Math.PI / 2)) < 1e-12);
});

test('Vector supports polar conversion, finite checks, and derived angle/magnitude updates', () => {
  const polar = Vector.fromPolar(Math.PI / 2, 4);
  assert.ok(Math.abs(polar.x) < 1e-12);
  assert.ok(Math.abs(polar.y - 4) < 1e-12);
  assert.equal(Vector.isFinite(polar), true);
  assert.equal(Vector.isFinite({ x: Infinity, y: 0 }), false);

  const vector = new Vector(3, 4);
  assert.equal(vector.magnitude, 5);
  assert.ok(Math.abs(vector.angle - Math.atan2(4, 3)) < 1e-12);
  assert.equal(vector.distanceToSQ({ x: 6, y: 8 }), 25);

  vector.magnitude = 10;
  assert.ok(Math.abs(vector.magnitude - 10) < 1e-10);

  vector.angle = 0;
  assert.ok(Math.abs(vector.x - 10) < 1e-10);
  assert.ok(Math.abs(vector.y) < 1e-10);

  vector.add({ x: 5, y: -2 });
  vector.subtract({ x: 1, y: 3 });
  assert.ok(Math.abs(vector.x - 14) < 1e-10);
  assert.ok(Math.abs(vector.y + 5) < 1e-10);
});

test('shared cleanup helpers preserve arena sizing and boss idle/aim rotation behavior', () => {
  assert.equal(getAutoSizedArenaDimension(0), 2500);
  assert.equal(getAutoSizedArenaDimension(1), 2500);
  assert.equal(getAutoSizedArenaDimension(4), 5000);

  const idleBoss = {
    ai: {
      state: AIState.idle,
      passiveRotation: 0.25,
      inputs: { mouse: { x: 20, y: 5 } }
    },
    positionData: {
      angle: 1,
      values: { x: 10, y: 10 }
    },
    velocity: null,
    setVelocity(x, y) {
      this.velocity = { x, y };
    }
  };
  applyIdleSpinOrTrackTarget(idleBoss);
  assert.equal(idleBoss.positionData.angle, 1.25);
  assert.deepEqual(idleBoss.velocity, { x: 0, y: 0 });

  const trackingBoss = {
    ai: {
      state: AIState.possessed,
      passiveRotation: 0.5,
      inputs: { mouse: { x: 13, y: 14 } }
    },
    positionData: {
      angle: 0,
      values: { x: 10, y: 10 }
    },
    velocity: null,
    setVelocity(x, y) {
      this.velocity = { x, y };
    }
  };
  applyIdleSpinOrTrackTarget(trackingBoss);
  assert.ok(Math.abs(trackingBoss.positionData.angle - Math.atan2(4, 3)) < 1e-12);
  assert.equal(trackingBoss.velocity, null);
});
