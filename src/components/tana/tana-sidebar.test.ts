import assert from "node:assert/strict";
import { test } from "node:test";

import { cycleTanaSidebarMode } from "./tana-sidebar";

test("sidebar mode uses one full → mini → hidden → full cycle", () => {
  assert.equal(cycleTanaSidebarMode("full"), "mini");
  assert.equal(cycleTanaSidebarMode("mini"), "hidden");
  assert.equal(cycleTanaSidebarMode("hidden"), "full");
});
