#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const tsReport = JSON.parse(execFileSync(process.execPath, [path.join(root, 'conformance/gameplay/report-ts.js')], { cwd: root, encoding: 'utf8' }));
const cppReport = JSON.parse(execFileSync(path.join(root, 'build/cpp/gameplay_report'), { cwd: root, encoding: 'utf8' }));

assert.deepEqual(cppReport, tsReport);
console.log('gameplay parity report matched TypeScript reference');
