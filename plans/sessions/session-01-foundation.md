# Session 01 — Foundation & scaffolding

**Estimated:** ~2h focused  
**Depends on:** Bun installed locally  
**Status:** done  
**Links:** `plans/decisions/0001-architecture-choices.md`

## Goal

Land a clean monorepo skeleton. Bun workspaces, TypeScript, Biome, Vite+Solid studio app, stubbed `@kut-kut/engine` package with a working workspace import. End state: `bun run dev` opens a blank Solid page that displays the engine's `VERSION` string; `bun test`, `bun run typecheck`, `bun run lint`, `bun run format` all pass (empty-but-green is fine).

## Design

**Monorepo layout (Bun workspaces):**

```
/
├── package.json                  # private root, workspaces: ["apps/*", "packages/*"]
├── bunfig.toml
├── biome.json                    # lint + format, one config for the whole repo
├── tsconfig.base.json            # strict, module: "ESNext", moduleResolution: "Bundler"
├── .gitignore                    # includes .env.local, node_modules, dist, .peaks/
├── .editorconfig
├── apps/studio/
│   ├── package.json              # name: "@kut-kut/studio", private: true
│   ├── vite.config.ts            # vite-plugin-solid
│   ├── tsconfig.json             # extends base; jsx: "preserve"; jsxImportSource: "solid-js"
│   ├── index.html
│   └── src/
│       ├── main.tsx              # render(() => <App/>, ...)
│       └── App.tsx               # "Kut-Kut" + engine.VERSION
└── packages/engine/
    ├── package.json              # name: "@kut-kut/engine"; type: "module"; peerDep solid-js; "exports": { ".": "./src/index.ts" }
    ├── tsconfig.json             # extends base; declaration: true
    ├── src/index.ts              # export const VERSION = "0.0.0"
    └── test/smoke.test.ts        # bun test — trivial assertion on VERSION
```

**Dependencies**

- Root (dev): `typescript`, `@biomejs/biome`, `@types/bun`.
- `apps/studio`: `solid-js`, `vite`, `vite-plugin-solid`, workspace dep on `@kut-kut/engine`.
- `packages/engine`: peer `solid-js`; dev-only `typescript`.
- **Defer** to later sessions: `pixi.js@^8` (session 04), `three` (session 04), `mp4-muxer` (session 14). Do not install them yet.

**Scripts (root `package.json`)**

- `dev` → `bun --cwd apps/studio run dev`
- `build` → `bun --cwd apps/studio run build`
- `typecheck` → run `tsc --noEmit` in each workspace
- `test` → `bun test`
- `lint` → `biome check .`
- `format` → `biome format --write .`

**No COOP/COEP needed.** We use WebCodecs only; SharedArrayBuffer is not required.

## Tasks

1. [x] Root: `package.json` (private, workspaces), `.gitignore`, `tsconfig.base.json`, `biome.json`. (Dropped `bunfig.toml` — nothing to configure yet. Dropped `.editorconfig` — `biome.json` is authoritative for formatting.)
2. [x] `packages/engine` skeleton: `package.json` (exports map, peerDep `solid-js`), `tsconfig.json`, `src/index.ts` with `export const VERSION = "0.0.0"`.
3. [x] `apps/studio` skeleton: `package.json` (workspace dep on engine), `vite.config.ts` (solid plugin), `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx` displaying `engine.VERSION`.
4. [x] `bun install` — confirm workspace resolution.
5. [x] `bun run dev` — verify the studio boots and renders the engine version in the browser.
6. [x] `bun run typecheck`, `bun test`, `bun run lint`, `bun run format` — all green.
7. [ ] Minimal root `README.md` with the command list (optional if it duplicates `CLAUDE.md`).

## Non-goals

- No scene graph, no timeline, no renderers (those are sessions 02–04).
- No Pixi or Three install yet.
- No Vite dev plugin yet (session 06).
- No `projects/` directory contents yet (can create an empty `.gitkeep` if desired).
- No routing, no theming, no design system, no icons.
- No CI. No deploy config.
- No feature folders beyond what's listed.

## Verification

- `bun run dev` → page at localhost shows "Kut-Kut" + `0.0.0`.
- `bun run typecheck` → clean in both workspaces.
- `bun run lint` and `bun run format` → no errors.
- `packages/engine/src/index.ts` has no DOM imports. `apps/studio` imports only from `@kut-kut/engine` (no deep paths).
