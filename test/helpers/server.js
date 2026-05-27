const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

function waitForOutput(child, matcher, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for server output ${matcher}; output:\n${output}`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString();
      if (typeof matcher === 'string' ? output.includes(matcher) : matcher.test(output)) {
        cleanup();
        resolve(output);
      }
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Server exited before readiness (code=${code}, signal=${signal}); output:\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

async function startServer(options = {}) {
  const port = options.port || await getFreePort();
  const root = path.resolve(__dirname, '../..');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SERVER_INFO: options.serverInfo || 'test-suite'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const readyOutput = await waitForOutput(child, `Listening on port ${port}`, options.timeoutMs);

  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    wsOrigin: `ws://127.0.0.1:${port}`,
    child,
    readyOutput,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      const result = await Promise.race([
        once(child, 'exit').then(([code, signal]) => ({ code, signal })),
        new Promise((resolve) => setTimeout(() => resolve(null), 2_000))
      ]);
      if (!result) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs || 3_000) });
  return { response, text: await response.text() };
}

async function expectJson(url, validate, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs || 3_000) });
  assert.equal(response.status, options.status || 200);
  assert.match(response.headers.get('content-type') || '', /text|json|octet-stream|^$/);
  const json = await response.json();
  validate(json);
  return json;
}

function connectWebSocket(url, { timeoutMs = 3_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out opening websocket ${url}`));
    }, timeoutMs);
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error while opening ${url}`));
    }, { once: true });
  });
}

function waitForWebSocketClose(ws, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket close')), timeoutMs);
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve(event);
    }, { once: true });
  });
}

function waitForWebSocketMessage(ws, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), timeoutMs);
    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      resolve(event.data);
    }, { once: true });
  });
}

module.exports = {
  connectWebSocket,
  expectJson,
  fetchText,
  getFreePort,
  startServer,
  waitForWebSocketClose,
  waitForWebSocketMessage
};
