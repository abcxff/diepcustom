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

test('PettingZoo-compatible Python ParallelEnv wrapper exposes multi-agent actions without reward shaping', () => {
  execFileSync('python3', ['conformance/headless/python_pettingzoo_smoke.py'], { cwd: root, stdio: 'inherit' });
});

test('PettingZoo official Parallel API test passes when optional dependencies are installed', () => {
  const venvPython = path.join(root, '.venv/bin/python');
  if (!fs.existsSync(venvPython)) {
    return;
  }
  execFileSync(venvPython, ['conformance/headless/python_pettingzoo_api_test.py'], { cwd: root, stdio: 'inherit' });
});


test('Python tickless training benchmark runs batched C ABI paths', () => {
  const venvPython = path.join(root, '.venv/bin/python');
  const python = fs.existsSync(venvPython) ? venvPython : 'python3';
  execFileSync(python, ['conformance/headless/python_training_benchmark.py'], { cwd: root, stdio: 'inherit' });
});
