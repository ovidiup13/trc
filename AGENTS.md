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
- Document new CLI flags or config fields in `README.md`
- Remove unused code and modules proactively.

## Tests and checks

- After any code change, run targeted tests for the impacted package(s).
- Always report which tests were run (or why they weren’t).
- After high impact changes, ALWAYS run `bun validate` to verify formatting, linting, types, and tests have passed.
- Write new tests for new features or bug fixes using `vitest`
- Use TDD - write tests before implementing features.
