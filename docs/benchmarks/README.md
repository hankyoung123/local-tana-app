# Tana benchmark

Run `bun run bench:tana` to print CSV timings for 1k, 5k, 10k, 25k and 50k
synthetic Nodes. It measures full `buildTanaIndex`, `searchTanaNodes`, and
`runTanaQuery` independently. Search/Query reuse a prebuilt index; index construction
is not included in their timings. Search uses the existing default limit of 20;
Query materializes all matches for `text-contains: Node 9`.

The deterministic fixture uses paragraph Nodes, with one flat root and nine direct
children per ten Nodes. Each operation has one warmup and seven measured samples.
Reported p95 is nearest-rank (the maximum of seven samples). This is a shallow,
plain-text baseline, not a claim about rich Fields or deeply nested documents.

No caches, business state, persistence changes, optimizations or CI thresholds are
introduced by the benchmark. Existing before/after CSVs document the earlier
index-only investigation and are retained as historical evidence.
