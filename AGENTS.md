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
- Every top-level Plate outliner block (`path.length === 1`) is a Tana Node,
  regardless of its Plate type. NodeId is identity; the Plate type controls
  presentation and editing behavior only.
- `isTanaNodeElement` is the sole Node boundary. Keep NodeId, TanaIndex,
  selection, DnD, navigation, search, and reference candidates aligned to it.
- Collapse is UI behavior only: derive parent/descendant structure from flat
  indent, then use Plate Toggle's `openIds`. Never change a Node's Plate type
  or write collapse state into Tana semantics.
