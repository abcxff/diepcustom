#!/usr/bin/env node
const path = require('node:path');
require(path.join(__dirname, '../../test/helpers/register-ts'));
const Reader = require('../../src/Coder/Reader').default;
const Writer = require('../../src/Coder/Writer').default;

const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const fromHex = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));

function encodeReport() {
  const cases = {};
  const add = (name, build) => {
    const writer = new Writer();
    build(writer);
    cases[name] = toHex(writer.write(true));
  };

  add('unsigned-varint-boundaries', (w) => [0, 1, 2, 3, 10, 127, 128, 129, 255, 16_384, 65_535, 2_147_483_647].forEach((v) => w.vu(v)));
  add('signed-varint-boundaries', (w) => [-2_000_000, -129, -128, -1, 0, 1, 127, 128, 2_000_000].forEach((v) => w.vi(v)));
  add('fixed-width-little-endian', (w) => w.u8(0xab).u16(0xcdef).u32(0x12345678).float(1.5));
  add('varint-floats', (w) => [-Math.PI, -1.5, 0, 1.5, Math.PI].forEach((v) => w.vf(v)));
  add('null-terminated-unicode', (w) => w.stringNT('Tank 🚀 Δ 漢字'));
  add('raw-bytes', (w) => w.raw(1, 2, 3, 255));
  return cases;
}

function decodeBoundary(name, hex, read) {
  const reader = new Reader(fromHex(hex));
  try {
    return { name, ok: true, value: read(reader), at: reader.at };
  } catch (error) {
    return { name, ok: false, error: error && error.name ? error.name : String(error), message: error && error.message ? error.message : '' };
  }
}

function decodeReport() {
  return [
    decodeBoundary('empty-vu', '', (r) => r.vu()),
    decodeBoundary('truncated-vu-continuation', '80', (r) => r.vu()),
    decodeBoundary('empty-stringNT', '00', (r) => r.stringNT()),
    decodeBoundary('unterminated-stringNT', '6162', (r) => r.stringNT()),
    decodeBoundary('fixed-empty-buffer-u8', '', (r) => r.u8())
  ];
}

process.stdout.write(`${JSON.stringify({ encoder: encodeReport(), boundaryDecode: decodeReport() }, null, 2)}\n`);
