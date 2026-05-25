const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'conformance/fixtures/physics-golden.json'), 'utf8'));

test('TS physics report matches golden fixture', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'conformance/physics/report-ts.js')], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), fixture);
});
