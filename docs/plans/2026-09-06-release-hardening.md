# Release hardening

Plate Document remains the only writable source; NodeId identifies canonical Nodes,
References point to them, and TanaIndex/Search/View are derived. SQLite only stores
the document. No migrations, compatibility aliases, placement store, projection
document, persistent graph, or sync layer are introduced.

- Persistence rejects unsupported table/document schemas, malformed JSON, invalid
  document structure and Tana metadata. Loading errors never mount Plate. Recovery
  offers retry or an explicitly confirmed destructive reset.
- Query runtime grammar is shared by Persistence, Integrity and Executor. Unknown
  predicates, empty text, invalid IDs/values and malformed/deep/cyclic expressions
  are rejected. The redundant parent predicate is removed outright.
- Close lifecycle prevents native close immediately, flushes through the existing
  save controller (including edits arriving during flush), then destroys the window.
  Failure keeps the window open. No save-controller replacement.
- Mutation execution rechecks Plate interaction state plus semantic policy.
- Reference title edits retain canonical ownership; child rows traverse only derived
  hierarchy and use the occurrence's Plate Toggle openIds. Hidden Fields are pruned.
  Deleting a Reference leaves its target intact.
- Search covers derived titles, Field labels/values, Supertags and References; its UI
  uses a modal Dialog. Trash exposes restore and confirmed permanent deletion.
- CI includes lint, tests, typecheck, builds, cargo test and clippy. Tauri CSP restricts
  resource origins; inline scripts/styles remain allowed for the static Next export.
  Browser Smoke is not a release blocker.

## Performance evidence

Run `bun scripts/benchmark-tana-index.ts`. Fixture: ordinary paragraph Nodes,
10% flat roots with nine direct children each; one warmup and seven measured full
index builds per size. CSVs record median and nearest-rank p95 (the maximum with
seven samples). These synthetic results do not claim rich-Field/deep-tree coverage.

| Nodes | Before median ms | After median ms |
| ---: | ---: | ---: |
| 1,000 | 4.69 | 2.14 |
| 5,000 | 100.58 | 6.79 |
| 10,000 | 406.19 | 12.58 |
| 25,000 | 2525.48 | 36.88 |
| 50,000 | 10892.54 | 80.49 |

The measured bottleneck was backward parent scanning for indent-0 roots. Returning
immediately for roots removes those scans without caching, incremental state or FTS.
See `docs/benchmarks/build-tana-index-{before,after}.csv` for the recorded timing summaries.
