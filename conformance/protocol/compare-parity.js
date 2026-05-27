#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const exe = path.join(root, 'build/cpp/protocol_report') + (process.platform === 'win32' ? '.exe' : '');

function runJson(command, args) {
  const output = execFileSync(command, args, { cwd: root, encoding: 'utf8' });
  return JSON.parse(output);
}

const tsReport = runJson(process.execPath, [path.join(root, 'conformance/protocol/report-ts.js')]);
const cppReport = runJson(exe, []);

assert.deepEqual(cppReport, tsReport);
console.log('protocol parity report matched TypeScript reference');
