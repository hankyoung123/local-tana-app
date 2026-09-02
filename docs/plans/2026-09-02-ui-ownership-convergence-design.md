# Local Tana UI Ownership Convergence

## Decision

The product UI keeps one owner for each interaction. Plate owns text editing,
keyboard behavior, selection, drag-and-drop, links, and trigger comboboxes. Tana
adds semantic presentation, structured controls, Inspector configuration, and
semantic mutations. No new store or alternate editor path is introduced.

## Interaction ownership

- `Mod+K` remains the Plate LinkPlugin shortcut. Local Tana only registers
  `Mod+P` for global Node search.
- Global search uses the project's existing `cmdk` primitives, so ArrowUp,
  ArrowDown, Enter, and Escape come from one established interaction model.
- `>` plus the Plate trigger combobox is the only visible Field creation flow.
  Inspector exposes source navigation and visibility, not Field creation.
- A Supertag Definition opens as an ordinary zoomed Outline Node. Its real
  Template Field children stay editable with Plate; instances are a secondary
  Inspector presentation.
- Options are the direct children of an Options Field Definition. Inspector
  does not duplicate their create, rename, reorder, or delete actions.

## Value presentation

Plain and Number Value Nodes use Plate contenteditable text. Number text is
derived into a numeric FieldValue only when syntactically complete; intermediate
text remains untouched in the document. Checkbox, Date, Options, and From
Supertag keep thin controls that mutate the same Value Node through
`TanaFieldPlugin`. No control owns persistent React value state.

Field rows show the derived Field label and one minimal hide action. Opening a
Field Definition remains available through the label. Clearing structured
values lives inside the structured Value control, while text values are cleared
by ordinary Plate editing.

## Verification

- Static searches prove Workspace no longer handles `mod+k` and Inspector no
  longer calls Field or Option creation transforms.
- Renderer tests prove Supertag Definitions use the ordinary Outline renderer
  and Options have no special block badge.
- Index tests prove incomplete Number text stays unset while parseable text is
  derived without rewriting the Plate text.
- Lint, typecheck, unit tests, Web build, Tauri build/check, and browser smoke
  tests cover the final integration.
