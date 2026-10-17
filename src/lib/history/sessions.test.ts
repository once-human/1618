import { test } from "node:test";
import assert from "node:assert/strict";
import { sessions } from "./sessions";

const H = 3600;
const M = 60;

test("one commit is one sitting, with the lead-up and a little after", () => {
  assert.deepEqual(sessions([10 * H]), [{ from: 10 * H - 45 * M, to: 10 * H + 10 * M, commits: 1 }]);
});

test("commits close together are one sitting", () => {
  assert.deepEqual(sessions([10 * H, 11 * H, 12 * H + 30 * M]), [{ from: 10 * H - 45 * M, to: 12 * H + 40 * M, commits: 3 }]);
});

test("a long break starts a new sitting, which never overlaps the last", () => {
  const s = sessions([10 * H, 13 * H]);
  assert.equal(s.length, 2);
  assert.equal(s[1].from, 13 * H - 45 * M);
  const tight = sessions([10 * H, 12 * H + 20 * M]); // 2h20m apart, lead would reach back
  assert.equal(tight.length, 2);
  assert.ok(tight[1].from >= tight[0].to);
});

test("order and duplicates don't matter", () => {
  assert.deepEqual(sessions([11 * H, 10 * H, 10 * H]), sessions([10 * H, 11 * H]));
});
