const { execFileSync } = require('node:child_process');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '../..');
const dylib = path.join(root, 'build/cpp/libdiepcustom_headless_c.dylib');
const so = path.join(root, 'build/cpp/libdiepcustom_headless_c.so');

if (!fs.existsSync(dylib) && !fs.existsSync(so)) {
  execFileSync('npm', ['run', 'test:cpp'], { cwd: root, stdio: 'inherit' });
}

test('python ctypes wrapper can reset, step, snapshot, and observe', () => {
  execFileSync('python3', ['conformance/headless/python_ctypes_smoke.py'], { cwd: root, stdio: 'inherit' });
});
