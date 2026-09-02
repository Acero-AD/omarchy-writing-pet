import test from "node:test";
import assert from "node:assert/strict";

// Proves the harness runs. Real coverage lives in model.test.mjs (task 2.9-2.10).
test("test harness is wired up", () => {
  assert.equal(1 + 1, 2);
});
