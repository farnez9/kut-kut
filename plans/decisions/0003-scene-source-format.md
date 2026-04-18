# 0003 — Scene source format: TypeScript primary, JSON for serialized state

**Date:** 2026-04-18
**Status:** accepted
**Context:** session 02 (scene graph + project schema). Resolves the "scene source format" open question in `plans/overview.md`.

## Decision

**TypeScript is the primary authoring format for scenes.** Each project under `projects/<name>/` ships a `scene.ts` that default-exports a `Scene` built with the engine's factories (`createScene`, `createLayer2D`, `createGroup`, …).

**JSON is the serialization format for runtime state**, not for authoring: `timeline.json` (keyframes, track edits from the studio), snapshots for undo/redo, and any future `state.json` the Vite plugin writes. The project-schema validator (ADR 0002) guards these JSON payloads at the boundary.

## Rationale

- **"Scenes as code" is the product pitch.** The README and `CLAUDE.md` both describe authoring via a TS file with live HMR. Making TS authoritative preserves that story.
- **TS gives authors real tooling.** Type checking, go-to-definition, refactors, expression helpers, loops to generate repetitive structure, imports for shared constants. JSON offers none of that.
- **Vite HMR + dynamic import.** The studio's boot flow (session 06) does `import(/* @vite-ignore */ \`/projects/${name}/scene.ts\`)`. Edits to `scene.ts` hot-reload the preview without a page refresh. JSON would need a custom watcher to match.
- **The studio still needs plain JSON.** Timeline drags, keyframe record, caption edits, asset imports — these GUI operations write machine-generated state that has no business living in a human-authored `.ts` file. So JSON is the format for state, TS is the format for intent.

## Boundary

| Concern | Where it lives | Format |
|---|---|---|
| Scene structure, named nodes, code helpers | `projects/<name>/scene.ts` | TS (module, default export `Scene`) |
| Timeline tracks/clips/keyframes | `projects/<name>/timeline.json` | JSON (validated) |
| Asset metadata (resolved during load) | derived from `projects/<name>/assets/` directory | N/A |
| Authoring-time scene edits via GUI | **not supported** in v1 | — |

The last row matters: v1 of the studio does **not** mutate `scene.ts`. Scene-graph edits from the GUI (add/delete node, change a property value) are session-08 territory and will persist as a separate overlay/state file, leaving `scene.ts` as pure author intent. If that turns out to feel wrong in practice, revisit here.

## Alternatives considered

- **JSON-only authoring.** Rejected — loses TS tooling, and forces authors into a custom schema editor instead of their IDE.
- **JSON-primary with optional TS.** Rejected — double implementation, unclear which wins when they disagree.
- **TS-only for everything (including timeline).** Rejected — studio-generated state in a hand-authored file is a merge-conflict factory and fights Vite HMR semantics.

## Consequences

- Engine `project/` ships **serializer + deserializer for the Scene**, used for snapshots and state roundtrips, **not** as the primary save format of `scene.ts`.
- `scene.ts` import at studio boot is how a scene enters memory; JSON serialization is how a scene leaves memory (for disk state, `postMessage`, undo history, export pipeline context).
- Session 16 finalizes the `scene.ts` authoring conventions (helper surface, ID stability, re-export patterns).

## When to revisit

- If GUI-driven scene editing (session 08) makes the two-format split painful.
- If "projects travel between machines" becomes a requirement — then an export-as-zip that bundles compiled `scene.ts` output + JSON state gets designed.
- If we grow a non-TS authoring surface (e.g., a visual scene editor) that needs its own persistence story.
