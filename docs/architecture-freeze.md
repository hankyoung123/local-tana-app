# Local Tana architecture freeze

This document records the v1 baseline. Product work must preserve these
boundaries unless it deliberately changes the data model and its regressions.

## Source of truth

- The Plate document is the only writable application state.
- A Plate block `id` is the Tana `NodeId`; identity is never copied into a
  second entity store.
- Flat document order plus `indent` derives hierarchy. No persisted
  `parentId`, `children`, placement, or projection document is allowed.
- `Workspace` is the unique root. Every other Tana Node is a descendant.
- SQLite persists the document snapshot only. It does not persist indexes,
  backlinks, query results, or presentation projections.

## Node semantics

- Every top-level editable outliner block is a Node, regardless of Plate
  presentation type.
- Field Definitions, Field occurrences, Values, Options, and Supertag
  Definitions are ordinary Nodes. Field hierarchy is represented by `indent`
  and document order.
- A block Reference keeps only `tanaReferenceTargetId`; inline references keep
  the target NodeId in Plate's reference key. Targets are never cloned.
- Supertag membership is only `tanaSupertagIds`. Inline `#` content is
  presentation, not membership state.
- Search owns a result-set definition (`tanaSearchDefinition`). View owns only
  presentation (`tanaViewDefinition`): Search and View are not interchangeable.

## Ownership

- `TanaIndex` is a read-only, whole-document derivation. Its parent/children,
  Fields, references, backlinks, membership, and system lookup maps are never
  written back as another state path.
- Plate owns generic editing, selection, DnD, history, keyboard handling, and
  navigation.
- Tana plugins own only semantic mutations and narrow semantic boundaries.
  Integrity is a last-resort relation repair, not a general Workspace manager.

## Regression baseline

The architecture regression suite covers the unique Workspace root and system
boundaries, stable NodeIds across splitting/reordering, Field-as-Node
structure, Supertag membership, reference/backlink derivation, and persistence
validation. Run:

```sh
bun test
bun run typecheck
bun run build
bun run build:tauri
bun run tauri:check
```
