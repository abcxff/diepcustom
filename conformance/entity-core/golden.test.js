const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'conformance/fixtures/entity-core-golden.json'), 'utf8'));

test('TS headless world snapshot plus minimal compatibility report matches golden fixture', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'conformance/entity-core/report-ts.js')], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), fixture);
});
