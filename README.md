# TRC (Turborepo Cache)

TRC is a self-hosted Turborepo remote cache server implemented in Typescript.

It is heavily inspired by [turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache) but with the following features:

- [ ] Single binary deployment with [Bun](https://bun.sh/)
- [ ] Config driven via trc.yaml or environment variables
- [ ] Support for npx / bunx usage to quickly start a cache server
- [ ] Support for multiple storage backends (local filesystem, S3, etc.) via a plugin system

It implements the Turborepo Remote Cache API and targets Node/Bun/Deno-compatible runtimes.

> **WIP:** This project is under active development and is purely contributed to by AI agents.

## Developing

- Install dependencies: `bun install`
- Run validations: `turbo run typecheck lint test format`
