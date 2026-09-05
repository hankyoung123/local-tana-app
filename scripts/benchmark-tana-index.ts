import { buildTanaIndex } from '../src/lib/tana/index';
import type { Value } from 'platejs';

console.log('nodes,median_ms,p95_ms');
for (const size of [1000, 5000, 10000, 25000, 50000]) {
  const document: Value = Array.from({ length: size }, (_, i) => ({
    id: `node-${i}`, type: 'p', indent: i % 10 === 0 ? 0 : 1,
    children: [{ text: `Node ${i}` }],
  }));
  buildTanaIndex(document);
  const durations: number[] = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    const index = buildTanaIndex(document);
    durations.push(performance.now() - start);
    if (index.nodesById.size !== size) throw new Error('Incomplete index');
  }
  durations.sort((a, b) => a - b);
  console.log(`${size},${durations[3].toFixed(2)},${durations[6].toFixed(2)}`);
}
