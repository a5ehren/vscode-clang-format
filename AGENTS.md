# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript VS Code extension for running `clang-format`.
Core extension logic lives in `src/extension.ts`, language mode metadata is in
`src/clangMode.ts`, and shared generated language configuration is under
`src/shared/`. Utility scripts belong in `src/scripts/`. Extension tests live in
`src/test/`; `src/test/extension.test.ts` uses a fake `clang-format` executable,
and `src/test/test.cxx` is test fixture content. Build output goes to `dist/`,
TypeScript output goes to `out/`, and VS Code test downloads live in
`.vscode-test/`; do not edit generated output directly. Extension assets include
`clang-format.png` and `clang-format.xcf`.

## Build, Test, and Development Commands

Use Node `22.22.2` from `.node-version` and pnpm `10.33.2` from the
`packageManager` field. Run `corepack enable` once if the `pnpm` shim is not
available.

- `pnpm install --frozen-lockfile`: install dependencies from `pnpm-lock.yaml`.
- `pnpm compile`: run `vp build` and emit the bundled extension in `dist/`.
- `pnpm check`: run Vite+ checks, including lint/type-aware validation.
- `pnpm test`: build, run `tsc -p .`, then execute VS Code extension tests.
- `pnpm format-write`: format TypeScript files under `src/**/*.ts`.
- `pnpm vscode:prepublish`: package the extension with `vp pack`.

## Coding Style & Naming Conventions

Write TypeScript with 2-space indentation, double quotes, semicolons, and
`const`/`let` instead of `var`. Keep exported classes and interfaces in
`PascalCase`, functions and local variables in `camelCase`, and configuration
keys aligned with the `clang-format.*` namespace in `package.json`. Prefer small
helpers near their call sites unless code is shared across modules. Let
`pnpm format-write` and `pnpm check` settle style before review.

## Testing Guidelines

Tests use Mocha through `@vscode/test-cli` and `@vscode/test-electron`.
Name test files `*.test.ts` under `src/test/`; compiled tests are loaded from
`out/test/**/*.test.js` by `.vscode-test.mjs`. Add tests for formatter argument
construction, configuration precedence, byte-offset handling, and error paths
when changing formatter behavior. Keep fake-process behavior deterministic and
avoid depending on a host-installed `clang-format`.

## Commit & Pull Request Guidelines

Recent history uses short, imperative, lower-case summaries such as
`add some real tests` or `refresh dependencies`. Keep commits focused and update
`CHANGELOG.md` and `package.json` together for releases. Pull requests should
describe user-visible behavior changes, list validation commands run, link
related issues, and include screenshots only for visible VS Code UI changes.

## Agent-Specific Instructions

Use Context7 MCP for current documentation when answering library, framework,
SDK, API, CLI tool, or cloud-service questions. Do not use it for ordinary
repo refactoring, business-logic debugging, code review, or writing scripts from
scratch.
