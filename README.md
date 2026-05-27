<br><br>
<div align="center">
<img src="./icon.png" width="20%" />
<h3> diep custom </h3>
<p> An open source diep.io custom private-server template </p>
</div>
<br>

## Installation

You may need to install [Node.js](https://nodejs.org/), as well as the [Yarn Package Manager](https://classic.yarnpkg.com/en/docs/install).\
After doing so, download or clone this repository and install the dependencies with:
```bash
$ npm install
```

## C++ Migration / Headless RL Parity

This repository is being migrated toward a deterministic C++ core for headless RL-agent training while the TypeScript server remains the behavior reference. See [docs/cpp-migration-status.md](./docs/cpp-migration-status.md) for the current parity harness, completed slices, verification commands, and next recommended work.

Key migration commands:
```bash
npm run test:conformance
npm run test:cpp
npm run test:parity
npm run bench:gameplay
npm run test:all
```

## Running the Server

Run the server with:
```bash
$ npm run server
```
This builds and runs the server.

After running the server, content will be served at `localhost:PORT` on your computer. The port will default to 8080, and you may override it with `process.env.PORT`.

Consult `src/config.ts` for configuration, and `package.json` for environ variable setup.

## Discord Chat

For support or discussion, please join our [online Discord chat](https://discord.gg/SyxWdxgHnT).

## Contribution

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for information on contributing.

## License

Please see [LICENSE](./LICENSE)
