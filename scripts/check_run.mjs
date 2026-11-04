// Drives every route with every bike preset. `--update-golden` rewrites tests/golden-runs.json.
import fs from 'node:fs';
import { allRuns } from './route-runs.mjs';

const update = process.argv.includes('--update-golden');
const golden = {};
let failed = false;
for (const result of allRuns()) {
  console.log(JSON.stringify(result));
  golden[result.route + ' / ' + result.setup] = result.seconds;
  if (!result.complete || result.crashed || result.maxOffTrack > 2) failed = true;
}
if (update && !failed) {
  fs.writeFileSync('tests/golden-runs.json', JSON.stringify(golden, null, 2) + '\n');
  console.log('Golden run times updated.');
}
process.exitCode = failed ? 1 : 0;
