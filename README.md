# Local Tana

Local Tana is a desktop-first outliner built on the official Plate editor stack.

```
Plate Playground core
+ thin Tana semantics
+ local SQLite persistence
= Local Tana
```

Plate owns editing behavior: node IDs, selection, drag and drop, list/indent,
toggle state, mention, combobox, slash commands, history, clipboard, and IME.
Local Tana only adds node references, supertags, fields, derived indexes, views,
and local persistence.

## Data model

- The Plate document is the only writable source of truth.
- A Plate top-level outliner block ID is the Local Tana `NodeId`.
- `TanaIndex` is rebuilt from the current Plate document and is read-only.
- Reference and supertag elements persist only `key: targetNodeId`; their labels
  are dynamically derived from the target node.
- The Tauri app serializes debounced SQLite writes and flushes before page hide
  or desktop-window close.

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:3000/editor` for the browser preview. SQLite persistence
is enabled in the Tauri desktop app:

```bash
bun run tauri:dev
```

## Verification

```bash
bun test
bun run typecheck
bun run build
bun run build:tauri
bun run tauri:check
```

The CI workflow runs the tests, TypeScript check, web build, and a Tauri debug
build without a bundled installer.

## Supported semantics

- Inline references (`@Node`) with backlinks and NodeId navigation
- Supertags (`#Tag`) with field definitions and values
- Text, number, boolean, date, select, and node-reference fields
- Full-rebuild TanaIndex and compact query views
- Plate Toggle/openIds-backed outliner collapse

Block references, FTS, incremental indexing, placements, and shared roots are
intentionally out of scope.
