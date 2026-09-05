import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTanaQueryAst, parseTanaQuery } from './query-ast';
import { runTanaQuery } from './query';
import { buildTanaIndex } from './index';

test('runtime AST rejects unknown kinds, invalid IDs, values and recursion', () => {
  const invalid: unknown[] = [null, {}, { type: 'not' }, { type: 'and', children: {} },
    { type: 'predicate', predicate: { kind: 'unknown' } },
    { type: 'predicate', predicate: { kind: 'text-contains', text: '  ' } },
    { type: 'predicate', predicate: { kind: 'child-of', nodeId: ' ' } },
    { type: 'predicate', predicate: { kind: 'child-of', nodeId: 7 } },
    { type: 'predicate', predicate: { kind: 'field-equals', fieldId: 'f', value: { type: 'number', value: '2' } } },
    { type: 'and', children: [], extra: true }];
  const cycle = { type: 'not', child: null as unknown }; cycle.child = cycle;
  invalid.push(cycle);
  for (const value of invalid) {
    assert.equal(isTanaQueryAst(value), false);
    assert.throws(() => parseTanaQuery(value));
    assert.throws(() => runTanaQuery(buildTanaIndex([]), value as never));
  }
  assert.equal(isTanaQueryAst({ type: 'and', children: [] }), true);
  assert.equal(isTanaQueryAst({ type: 'not', child: { type: 'predicate', predicate: { kind: 'child-of', nodeId: 'node' } } }), true);
});
