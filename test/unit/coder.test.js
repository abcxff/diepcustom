const assert = require('node:assert/strict');
const test = require('node:test');
require('../helpers/register-ts');
const Reader = require('../../src/Coder/Reader').default;
const Writer = require('../../src/Coder/Writer').default;

function roundTrip(writeValue, readValue) {
  const writer = new Writer();
  writeValue(writer);
  const bytes = writer.write(true);
  const reader = new Reader(bytes);
  return readValue(reader);
}

test('protocol coder round-trips unsigned varints across boundary values', () => {
  for (const value of [0, 1, 2, 3, 10, 127, 128, 129, 255, 16_384, 65_535, 2_147_483_647]) {
    assert.equal(roundTrip((w) => w.vu(value), (r) => r.vu()), value);
  }
});

test('protocol coder round-trips signed varints and floats', () => {
  for (const value of [-2_000_000, -129, -128, -1, 0, 1, 127, 128, 2_000_000]) {
    assert.equal(roundTrip((w) => w.vi(value), (r) => r.vi()), value);
  }

  for (const value of [-Math.PI, -1.5, 0, 1.5, Math.PI]) {
    assert.ok(Math.abs(roundTrip((w) => w.float(value), (r) => r.float()) - value) < 0.00001);
    assert.ok(Math.abs(roundTrip((w) => w.vf(value), (r) => r.vf()) - value) < 0.00001);
  }
});

test('protocol coder preserves null-terminated unicode strings and raw bytes', () => {
  const text = 'Tank 🚀 Δ 漢字';
  const writer = new Writer();
  writer.u8(0xab).u16(0xcdef).u32(0x12345678).stringNT(text).raw(1, 2, 3, 255);
  const reader = new Reader(writer.write(true));
  assert.equal(reader.u8(), 0xab);
  assert.equal(reader.u16(), 0xcdef);
  assert.equal(reader.u32(), 0x12345678);
  assert.equal(reader.stringNT(), text);
  assert.deepEqual([reader.u8(), reader.u8(), reader.u8(), reader.u8()], [1, 2, 3, 255]);
});

test('writer grows beyond the default buffer chunk without corrupting bytes', () => {
  const writer = new Writer();
  const payload = Buffer.alloc(10_000, 0x5a);
  writer.bytes(payload);
  const bytes = writer.write(true);
  assert.equal(bytes.length, payload.length);
  assert.deepEqual(bytes.subarray(0, 16), payload.subarray(0, 16));
  assert.deepEqual(bytes.subarray(-16), payload.subarray(-16));
});
