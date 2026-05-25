#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const exe = path.join(root, 'build/cpp/physics_report') + (process.platform === 'win32' ? '.exe' : '');
const runJson = (command, args) => JSON.parse(execFileSync(command, args, { cwd: root, encoding: 'utf8' }));

const tsReport = runJson(process.execPath, [path.join(root, 'conformance/physics/report-ts.js')]);
const cppReport = runJson(exe, []);
assert.deepEqual(cppReport, tsReport);
console.log('physics parity report matched TypeScript reference');
