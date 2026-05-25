#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const tsReport = JSON.parse(execFileSync(process.execPath, [path.join(root, 'conformance/entity-core/report-ts.js')], { cwd: root, encoding: 'utf8' }));
const cppReport = JSON.parse(execFileSync(path.join(root, 'build/cpp/entity_core_report'), { cwd: root, encoding: 'utf8' }));

assert.deepEqual(cppReport, tsReport);
console.log('entity-core parity report matched TypeScript reference');
