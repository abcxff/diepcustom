#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const bin = path.join(root, 'build/cpp/headless_sim');

function positiveIntegerFromEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  return value;
}

const ticks = positiveIntegerFromEnv('TICKS', 100000);
const agents = positiveIntegerFromEnv('AGENTS', 8);
const scenarios = ['empty-arena', 'agents-no-fire', 'agents-projectiles', 'dense-collision'];

function runScenario(scenario) {
  const reportText = execFileSync(bin, [`--seed=123`, `--agents=${agents}`, `--ticks=${ticks}`, `--scenario=${scenario}`], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
  return JSON.parse(reportText);
}

const reports = scenarios.map(runScenario);
console.log(JSON.stringify({ benchmark: 'headless-in-engine-tick-throughput', ticks, agents, reports }, null, 2));
if (!reports.every((report) => report.ticks === ticks && report.ticksPerSecond > 0)) process.exitCode = 1;
