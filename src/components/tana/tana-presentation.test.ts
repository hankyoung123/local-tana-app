import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getTanaDisplayIndent,
  getTanaDisplayIndentPx,
  TANA_INDENT_PX,
} from './tana-presentation';

test('derives Zoom indentation relative to the focused Node without changing raw depth', () => {
  assert.equal(getTanaDisplayIndent(3, 3), 0);
  assert.equal(getTanaDisplayIndent(4, 3), 1);
  assert.equal(getTanaDisplayIndent(5, 3), 2);
  assert.equal(getTanaDisplayIndent(1, 3), 0);
  assert.equal(getTanaDisplayIndentPx(5, 3), 2 * TANA_INDENT_PX);
});
