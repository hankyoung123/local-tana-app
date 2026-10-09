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
bun run dev --port 3187
```

Open `http://127.0.0.1:3187/editor` for the browser preview. SQLite persistence
is enabled in the Tauri desktop app:

```bash
bun run tauri:dev
```

## STILL UI/UX

The UI/UX design constraints are defined in
[`docs/plans/2026-10-09-still-ui-ux-spec.md`](docs/plans/2026-10-09-still-ui-ux-spec.md).
The design references the Codex desktop app, using neutral gray and white,
low-contrast boundaries, and nested rounded containers. The Plate outliner
remains the editor boundary; shared design tokens and interaction patterns
guide the surrounding product UI.

The surrounding framework is composed of `TanaWorkspaceShell` (window and
panel layout), `TanaWorkspaceToolbar` (shared commands), and the sidebar and
inspector. `src/styles/still-tokens.css` is the visual contract;
`src/styles/still-shell.css` supplies its shared containers and controls.
The default sidebar is 240px, the toolbar 52px, and the document at most 740px.
Properties dock on wide windows and overlay the document on narrower windows.
Clicking a Supertag opens its host's properties in place. Inline property
controls write through the existing Plate Field transforms.

Common shell shortcuts are `⌘ K` (also `⌘ S`) for Search, `⌘ P` for the
Command Palette, `⌘ E` for Quick Add, `⇧⌘ T` for Today, and `⇧⌘ F` for
Focus Mode. Appearance can follow the system or use a saved light/dark choice.

Visual comparisons, interaction checks, and the native preview scope are
recorded in [`design-qa.md`](design-qa.md).

## Verification

```bash
bun test
bun run typecheck
bun run lint
bun run test:ui
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
