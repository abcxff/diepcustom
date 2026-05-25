const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
require('../../test/helpers/register-ts');
const Reader = require('../../src/Coder/Reader').default;
const Writer = require('../../src/Coder/Writer').default;

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/protocol-golden.json'), 'utf8'));
const byName = new Map(fixture.cases.map((entry) => [entry.name, entry.hex]));
const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const fromHex = (hex) => Uint8Array.from(Buffer.from(hex, 'hex')); // Avoid Buffer pool byteOffset because Reader intentionally wraps buf.buffer.

const readers = {
  vu: (reader) => reader.vu(),
  u8: (reader) => reader.u8(),
  stringNT: (reader) => reader.stringNT()
};

function expectGolden(name, build) {
  const writer = new Writer();
  build(writer);
  assert.equal(toHex(writer.write(true)), byName.get(name));
}

test('TS protocol writer matches golden byte fixtures', () => {
  expectGolden('unsigned-varint-boundaries', (w) => [0, 1, 2, 3, 10, 127, 128, 129, 255, 16_384, 65_535, 2_147_483_647].forEach((v) => w.vu(v)));
  expectGolden('signed-varint-boundaries', (w) => [-2_000_000, -129, -128, -1, 0, 1, 127, 128, 2_000_000].forEach((v) => w.vi(v)));
  expectGolden('fixed-width-little-endian', (w) => w.u8(0xab).u16(0xcdef).u32(0x12345678).float(1.5));
  expectGolden('varint-floats', (w) => [-Math.PI, -1.5, 0, 1.5, Math.PI].forEach((v) => w.vf(v)));
  expectGolden('null-terminated-unicode', (w) => w.stringNT('Tank 🚀 Δ 漢字'));
  expectGolden('raw-bytes', (w) => w.raw(1, 2, 3, 255));
});

test('TS protocol reader decodes golden byte fixtures', () => {
  let reader = new Reader(fromHex(byName.get('unsigned-varint-boundaries')));
  assert.deepEqual([0, 1, 2, 3, 10, 127, 128, 129, 255, 16_384, 65_535, 2_147_483_647].map(() => reader.vu()), [0, 1, 2, 3, 10, 127, 128, 129, 255, 16_384, 65_535, 2_147_483_647]);

  reader = new Reader(fromHex(byName.get('signed-varint-boundaries')));
  assert.deepEqual([-2_000_000, -129, -128, -1, 0, 1, 127, 128, 2_000_000].map(() => reader.vi()), [-2_000_000, -129, -128, -1, 0, 1, 127, 128, 2_000_000]);

  reader = new Reader(fromHex(byName.get('fixed-width-little-endian')));
  assert.equal(reader.u8(), 0xab);
  assert.equal(reader.u16(), 0xcdef);
  assert.equal(reader.u32(), 0x12345678);
  assert.equal(reader.float(), 1.5);

  reader = new Reader(fromHex(byName.get('varint-floats')));
  for (const expected of [-Math.PI, -1.5, 0, 1.5, Math.PI]) {
    assert.ok(Math.abs(reader.vf() - expected) < 0.00001);
  }

  reader = new Reader(fromHex(byName.get('null-terminated-unicode')));
  assert.equal(reader.stringNT(), 'Tank 🚀 Δ 漢字');
});


test('TS protocol reader documents malformed and boundary fixture behavior', () => {
  for (const boundary of fixture.boundaryDecode) {
    const reader = new Reader(fromHex(boundary.hex));
    if (boundary.ok) {
      const value = readers[boundary.method](reader);
      if (Object.prototype.hasOwnProperty.call(boundary, 'value')) assert.equal(value, boundary.value, boundary.name);
      else assert.equal(value, undefined, boundary.name);
      assert.equal(reader.at, boundary.at, boundary.name);
    } else {
      assert.throws(() => readers[boundary.method](reader), undefined, boundary.name);
    }
  }
});
