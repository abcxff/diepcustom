<br><br>
<div align="center">
<img src="./icon.png" width="20%" />
<h3> diep custom </h3>
<p>An open source diep.io custom private-server template with active TypeScript gameplay, conformance tests, and a headless C++ RL/parity track.</p>
</div>
<br>

## What is in this repo

This repository currently has two active tracks:

- **TypeScript server/runtime**: the playable reference implementation, HTTP client hosting, REST metadata endpoints, and WebSocket game server.
- **C++ headless/parity work**: deterministic conformance slices, a headless simulator, and Python RL wrappers used for migration and training experiments.

The production-facing server path still comes from the TypeScript runtime. The C++ code is currently a parity/headless training surface, not a drop-in server replacement.

## Installation

Requirements:

- Node.js
- npm
- CMake (for `npm run test:cpp`, `npm run test:parity`, and headless/C++ work)
- Python + optional `.venv` tooling only if you are using the RL/PettingZoo flow

Install dependencies with:

```bash
npm install
```

## Running the server

Build and start the current TypeScript server with:

```bash
npm run server
```

Useful development commands:

```bash
npm run dev      # watch/build/run loop
npm run build    # typecheck + bundle to lib/
npm run check    # TypeScript typecheck only
npm test         # build + unit + e2e
```

By default the server listens on `http://localhost:8080`. Override the port with `PORT`.

Relevant runtime environment variables:

- `PORT`: HTTP + WebSocket port, defaults to `8080`
- `SERVER_INFO`: host/server label surfaced through config
- `NODE_ENV`: runtime mode string
- `DEV_PASSWORD_HASH`: optional hashed dev password

## Current live server surfaces

The current boot path in `src/index.ts` starts these public gamemode endpoints:

- WebSocket `ws://localhost:PORT/ffa`
- WebSocket `ws://localhost:PORT/sandbox`

The current REST metadata endpoints are:

- `GET /api/servers`
- `GET /api/tanks`
- `GET /api/commands`
- `GET /api/colors`

The built-in client host currently serves:

- `/`
- `/loader.js`
- `/input.js`
- `/dma.js`
- `/config.js`

## Testing and verification

Current core commands:

```bash
npm run test:unit
npm run test:e2e
npm run test:conformance
npm run test:cpp
npm run test:parity
npm run test:headless
npm run bench:headless
npm run test:all
```

`npm run test:all` is the broadest baseline: build, unit, e2e, conformance, and audit.

## C++ migration / headless RL

The repository is actively migrating selected deterministic behavior toward a faster C++ core for parity validation and headless RL training while TypeScript remains the gameplay reference.

Start here:

- [docs/cpp-migration-status.md](./docs/cpp-migration-status.md)
- [docs/headless-pettingzoo-api.md](./docs/headless-pettingzoo-api.md)
- [docs/headless-rl-action-abi.md](./docs/headless-rl-action-abi.md)
- [docs/headless-rl-handoff.md](./docs/headless-rl-handoff.md)
- [PETTINGZOO_REWARDS_QUICKSTART.md](./PETTINGZOO_REWARDS_QUICKSTART.md)
- [RL_testing/SB3_test/README.md](./RL_testing/SB3_test/README.md)

## Configuration notes

Most server constants live in `src/config.ts`.

A few important defaults from the current code:

- Tick rate: `40 mspt` / `25 TPS`
- Max incoming WebSocket payload: `4096` bytes
- API hosting: enabled by default
- Client hosting: enabled when `./client` exists

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for workflow, verification expectations, and the current Lore commit protocol.

## Discord Chat

For support or discussion, please join the [Discord chat](https://discord.gg/SyxWdxgHnT).

## License

Please see [LICENSE](./LICENSE).
