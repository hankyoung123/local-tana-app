# Supertag Inheritance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow Supertag Definition Nodes to inherit templates and instance membership from parent Supertags while keeping the Plate document as the sole source of truth.

**Architecture:** Store only an ordered `extends` list of parent Supertag NodeIds on the existing `tanaSupertagDefinition` metadata. Resolve ancestors and inherited templates in the derived TanaIndex, with cycle-safe domain validation in `TanaSupertagPlugin`; no second store or copied document is introduced.

**Tech Stack:** TypeScript, Plate, Bun node tests, Next.js.

---

### Task 1: Extend the existing Supertag metadata contract

**Files:** `src/lib/tana/types.ts`, `src/lib/tana/persistence.ts`, `src/components/editor/plugins/tana-node-identity-plugin.ts`

1. Add optional ordered parent NodeIds to `SupertagDefinition`.
2. Validate the shape in persistence without requiring parent targets to exist.
3. Keep the metadata key in the Node split semantic scrub list.

### Task 2: Derive inherited templates and membership

**Files:** `src/lib/tana/fields.ts`, `src/lib/tana/index.ts`

1. Resolve parent definitions with a visited set.
2. Merge inherited templates parent-first and direct templates last, de-duplicated by FieldId.
3. Populate `nodesBySupertag` for inherited parent tags while retaining direct membership in the document.

### Task 3: Own safe mutations in the Supertag plugin

**Files:** `src/components/editor/plugins/tana-supertag-plugin.ts`, `src/components/editor/plugins/tana-integrity-plugin.ts`

1. Add a `setExtends` transform that accepts only existing Supertag Definition Nodes, removes duplicates, and rejects self/cyclic graphs.
2. Prune dangling or cyclic persisted parent links as exceptional integrity repair.
3. Make Apply materialize inherited Field and plain templates.

### Task 4: Regression coverage

**Files:** `src/lib/tana/supertag.test.ts`, `src/lib/tana/index.test.ts`, `src/lib/tana/persistence.test.ts`

1. Test parent-first inherited templates and inherited query candidates.
2. Test cycle rejection and dangling-link repair.
3. Run `bun test`, `bun run typecheck`, `bun run lint`, `bun run build`, `bun run build:tauri`, and `bun run tauri:check`.
