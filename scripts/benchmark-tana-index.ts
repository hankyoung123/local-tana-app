import { buildTanaIndex, searchTanaNodes } from '../src/lib/tana/index';
import { createAndQuery, runTanaQuery } from '../src/lib/tana/query';
import type { Value } from 'platejs';

// Deterministic shallow outliner: one root and nine children per ten Nodes.
// Search and Query timings exclude index construction. No persistence or UI.
const repeats = 7;
console.log('nodes,operation,median_ms,p95_ms');
for (const size of [1000, 5000, 10000, 25000, 50000]) {
  const document: Value = Array.from({ length: size }, (_, i) => ({
    id: `node-${i}`, type: 'p', indent: i % 10 === 0 ? 0 : 1,
    children: [{ text: `Node ${i}` }],
  }));
  const index = buildTanaIndex(document);
  const query = createAndQuery([{ kind: 'text-contains', text: 'Node 9' }]);
  const operations = {
    buildTanaIndex: () => buildTanaIndex(document).nodesById.size,
    searchTanaNodes: () => searchTanaNodes(index, 'Node 9').length,
    runTanaQuery: () => runTanaQuery(index, query).length,
  };
  for (const [name, run] of Object.entries(operations)) {
    if (run() <= 0) throw new Error(`Empty benchmark result: ${name}`);
    const durations: number[] = [];
    for (let sample = 0; sample < repeats; sample++) {
      const start = performance.now();
      run();
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    console.log(`${size},${name},${durations[3].toFixed(2)},${durations[6].toFixed(2)}`);
  }
}
