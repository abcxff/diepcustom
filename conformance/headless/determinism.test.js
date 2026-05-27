const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '../..');
const bin = path.join(root, 'build/cpp/headless_sim');

if (!fs.existsSync(bin)) {
  execFileSync('npm', ['run', 'test:cpp'], { cwd: root, stdio: 'inherit' });
}

function snapshot(args) {
  const output = execFileSync(bin, [...args, '--snapshot-json', '--no-report-json'], { cwd: root, encoding: 'utf8' });
  return JSON.parse(output);
}

test('headless simulator is deterministic for the same seed and scripted actions', () => {
  const args = ['--seed=123', '--agents=4', '--ticks=40', '--scenario=agents-projectiles'];
  assert.deepEqual(snapshot(args), snapshot(args));
});

test('headless simulator records seed and tick state in full-world snapshots', () => {
  const snap = snapshot(['--seed=321', '--agents=2', '--ticks=10', '--scenario=basic-ffa']);
  assert.equal(snap.seed, 321);
  assert.equal(snap.tick, 10);
  assert.equal(snap.manager.agentIds.length, 2);
  assert.ok(Array.isArray(snap.entities));
});
