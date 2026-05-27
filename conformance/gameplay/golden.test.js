const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const fixturePath = path.join(root, 'conformance/fixtures/gameplay-golden.json');
const reportPath = path.join(root, 'conformance/gameplay/report-ts.js');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function runReport() {
  return JSON.parse(execFileSync(process.execPath, [reportPath], { cwd: root, encoding: 'utf8' }));
}

test('TS headless gameplay damage scenario matches golden fixture', () => {
  assert.deepEqual(runReport(), fixture);
});

test('TS headless gameplay report is deterministic across repeated runs', () => {
  assert.deepEqual(runReport(), runReport());
});
