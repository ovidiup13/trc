# Agent Guidelines

This repository hosts TRC (Turborepo Remote Cache). Use the notes below when working on the codebase.

## Project basics

- Package manager: `bun`
- Monorepo tooling: `turborepo`
- Primary apps live under `apps/`
- Primary packages live under `packages/`

## Common commands

- Install dependencies: `bun install`
- Build all packages: `bun build`
- Start server locally: `npx trc -c apps/server/trc.example.yaml`

## Development notes

- Prefer minimal, targeted changes with clear intent.
- Keep config and example files in sync when changing defaults.
- Document new CLI flags or config fields in `README.md`.

## Tests and checks

- Run targeted tests when available.
- Write new tests for new features or bug fixes using `vitest`
- Use TDD - write tests before implementing features.
- If unsure, share the reasoning and ask before running long test suites.
- Validate changes with `turbo run lint test build --affected`
