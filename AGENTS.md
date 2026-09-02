<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local Tana core constraints

- Plate owns editor behavior.
- Tana adds semantics only.
- The Plate document is the source of truth.
- TanaIndex is derived and read-only.
- Do not introduce a second editor or state path.
- Prefer Plate official APIs before custom code.

## Frozen outliner base

- Node identity is `NodeId` plus the top-level `isTanaNodeElement` boundary; Plate type is presentation only.
- Flat `indent` derives hierarchy, and Plate Toggle `openIds` is the only collapse state.
- `isTanaNodeInteractable` is the single interaction boundary. Selection, DnD, navigation, and future product features must consume it rather than create a parallel visible-node model.
- Do not add projection documents, collapse/visibility stores, or new low-level outliner abstractions without an explicit change to these constraints.
- Every top-level Plate outliner block (`path.length === 1`) is a Tana Node,
  regardless of its Plate type. NodeId is identity; the Plate type controls
  presentation and editing behavior only.
- `isTanaNodeElement` is the sole Node boundary. Keep NodeId, TanaIndex,
  selection, DnD, navigation, search, and reference candidates aligned to it.
- Collapse is UI behavior only: derive parent/descendant structure from flat
  indent, then use Plate Toggle's `openIds`. Never change a Node's Plate type
  or write collapse state into Tana semantics.

## Frozen Field-as-Node model

- Field Definition, Field occurrence, Value, Option, and Supertag template
  entries are ordinary Plate Nodes with stable NodeIds.
- Options are the ordered direct child Nodes of an `options` Field Definition;
  do not add an `options[]` metadata list or a parallel candidate store.
- A Field occurrence may be hosted only by an ordinary Node or Supertag
  Definition Node. Value Nodes stay under their Field occurrence and cannot be
  moved independently.
- `isTanaFieldHostNode` is the canonical host invariant for Field writers,
  DnD policy, and Integrity validation. Plate remains the sole owner of
  Selection, DnD, Navigation, History, and keyboard behavior.
- Field visibility is presentation metadata only. Hiding a Field prunes the
  current Plate interaction and returns focus/zoom to its owner without
  deleting or copying Field/Value Nodes.
