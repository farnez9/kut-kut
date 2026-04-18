# 0002 — Schema validator: valibot

**Date:** 2026-04-18
**Status:** accepted
**Context:** session 02 (scene graph + project schema)

## Decision

Use **valibot** (v1.x) as the runtime schema validator for `@kut-kut/engine`. It guards the boundary between untrusted JSON (disk payloads round-tripped through the session-06 Vite plugin, hand-edited files, older schema versions) and the live scene graph.

## Alternatives considered

| Option | Why not |
|---|---|
| **zod** | ~13 kb minzipped regardless of usage; method-chain API doesn't tree-shake. The engine is publishable — every kb compounds for downstream consumers. |
| **Hand-rolled type guards** | No versioning story, no structured error messages, duplicates the TS types that the schema already encodes. Rejected. |
| **No validator (trust the input)** | A single corrupt or out-of-date `project.json` would silently propagate `NaN`/`undefined` into the renderer. Unacceptable for a tool that writes its own disk state. |

## Why valibot

- **Bundle size.** Standalone-function API; only the validators you import ship. Core + our usage ≈ 2–3 kb minzipped.
- **Tree-shakable by construction.** No prototype methods → unused validators disappear at build time.
- **Same mental model as zod.** `object`, `array`, `variant` (discriminated union), `picklist`, `parse`/`safeParse`. Porting between the two is mechanical if we ever need to.
- **TS inference.** `InferOutput<typeof Schema>` gives us the static type — schema is the single source of truth, no hand-maintained interfaces.

## Consequences

- Runtime dep added: `valibot@^1.3.1` (engine `package.json`).
- `src/project/schema.ts` is the canonical project shape. Type changes there *are* breaking changes and ship with a bumped `schemaVersion` + a migration step in `project/migrations.ts`.
- `deserialize(json)` throws `ValiError` (valibot's structured error) on invalid input. Studio will surface these as toast/dialog errors (session 06+).

## When to revisit

- If valibot's maintenance slows materially.
- If we need features valibot lacks and zod ships (e.g., async refinements, branded primitives) — re-evaluate rather than hack around.
- If the schema grows complex enough that codegen (e.g., TypeBox/Ajv) would beat per-request parsing cost. Not a concern at v1.
