import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allRuns } from '../scripts/route-runs.mjs';

// Physics changes must be deliberate: if a run time drifts by more than 1 %,
// check the handling and then refresh with `node scripts/check_run.mjs --update-golden`.
const golden = JSON.parse(fs.readFileSync('tests/golden-runs.json'));

test('autopilot completes every route and preset within 1 % of the golden time', () => {
  const seen = new Set();
  for (const run of allRuns()) {
    const key = run.route + ' / ' + run.setup;
    seen.add(key);
    assert.ok(run.complete && !run.crashed, key + ': ' + (run.reason || 'did not finish'));
    assert.ok(key in golden, 'No golden time for ' + key);
    const drift = Math.abs(run.seconds - golden[key]) / golden[key];
    assert.ok(drift <= 0.01, `${key}: ${run.seconds} s vs golden ${golden[key]} s`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(golden).sort());
});
