#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
function positiveIntegerFromEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

const iterations = positiveIntegerFromEnv('ITERATIONS', 25);
const warmups = positiveIntegerFromEnv('WARMUPS', 3);
const tsCommand = [process.execPath, path.join(root, 'conformance/gameplay/report-ts.js')];
const cppCommand = [path.join(root, 'build/cpp/gameplay_report')];

function run(command) {
  const [bin, ...args] = command;
  execFileSync(bin, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}

function measure(label, command) {
  for (let i = 0; i < warmups; i += 1) run(command);
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    run(command);
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1_000_000);
  }
  samples.sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    label,
    iterations,
    minMs: Number(samples[0].toFixed(3)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    meanMs: Number((total / samples.length).toFixed(3)),
    maxMs: Number(samples[samples.length - 1].toFixed(3))
  };
}

function main() {
  const ts = measure('typescript-gameplay-report', tsCommand);
  const cpp = measure('cpp-gameplay-report', cppCommand);
  const speedup = Number((ts.medianMs / cpp.medianMs).toFixed(2));
  const result = {
    benchmark: 'phase-d-gameplay-report-process-runtime',
    note: 'This measures report process runtime, including Node/TypeScript transpile startup for the TS reference. It is a migration signal, not a final in-engine tick benchmark.',
    warmups,
    iterations,
    ts,
    cpp,
    medianSpeedup: speedup,
    cppFaster: cpp.medianMs < ts.medianMs
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.cppFaster) {
    process.exitCode = 1;
  }
}

main();
