import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSelection, assetPath, recordKeys, selectionUrl } from '../src/regions.mjs';
import { surfaceDetails, HeightField, TreeCollisions } from '../src/physics.mjs';
const combinations = [
  getSelection('?region=uetliberg'),
  getSelection('?region=lenzerheide'),
  getSelection('?region=lenzerheide&line=technical'),
];
test('region and line selection accepts only known local routes', () => {
  assert.equal(getSelection('?region=unknown').id, 'uetliberg');
  assert.equal(getSelection('?region=uetliberg&line=technical').line, 'flow');
  assert.equal(getSelection('?region=lenzerheide&line=technical').title, 'Roots Line');
  assert.equal(getSelection('', 'lenzerheide').title, 'Alpine Flow');
  assert.equal(getSelection('?region=lenzerheide', 'lenzerheide', 'technical').line, 'flow');
  assert.equal(
    selectionUrl('/downhill/', 'lenzerheide', 'technical'),
    '/downhill/?region=lenzerheide&line=technical'
  );
});
test('records stay separate for each line and start separate V4 records for each bike setup', () => {
  const keys = combinations.map(recordKeys);
  assert.equal(keys[0].best, 'best.uetliberg.flow.v4.50-50-50');
  assert.equal(new Set(keys.flatMap(k => [k.best, k.ghost])).size, 6);
});
test('region assets use local folders while sharing the bike and common art', () => {
  const alpine = combinations[1],
    technical = combinations[2];
  assert.equal(assetPath(alpine, 'bike.glb'), 'assets/bike.glb');
  assert.equal(assetPath(alpine, 'height.bin'), 'assets/lenzerheide/height.bin');
  assert.equal(assetPath(technical, 'trail.json'), 'assets/lenzerheide/trail-technical.json');
  for (const selection of combinations)
    for (const name of [
      'region.json',
      'trail.json',
      'forest.json',
      'height.bin',
      'surface.bin',
      'decor.json',
      'terrain-v4-high.glb',
      'terrain-v4-mobile.glb',
      'corridor-v4-high.glb',
      'corridor-v4-mobile.glb',
      'tree-v2-high.glb',
      'tree-v2-mobile.glb',
      'tree-impostor.webp',
      'bike-v4.glb',
      'rider-v4.glb',
      'surface-details.json',
      'surface-details.bin',
      'corridor-v3-high.glb',
      'corridor-v3-mobile.glb',
      'tree-v4-high.glb',
      'tree-v4-mobile.glb',
      'tree-impostor-v4.webp',
    ])
      assert.ok(fs.existsSync('public/' + assetPath(selection, name)), selection.id + ': ' + name);
});
test('both Alpine routes align with the same complete 2 m collision field', () => {
  const a = 'public/assets/lenzerheide/',
    meta = JSON.parse(fs.readFileSync(a + 'region.json')),
    buffer = fs.readFileSync(a + 'height.bin'),
    surface = fs.readFileSync(a + 'surface.bin');
  assert.equal(buffer.byteLength, meta.width * meta.height * 4);
  assert.equal(surface.length, meta.width * meta.height);
  assert.equal(meta.step, 2);
  const field = new HeightField(
      meta,
      new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4),
      null,
      [],
      surfaceDetails(
        JSON.parse(fs.readFileSync(a + 'surface-details.json')),
        new Int16Array(Uint8Array.from(fs.readFileSync(a + 'surface-details.bin')).buffer)
      )
    ),
    trees = new TreeCollisions(JSON.parse(fs.readFileSync(a + 'forest.json')));
  for (const file of ['trail.json', 'trail-technical.json']) {
    const trail = JSON.parse(fs.readFileSync(a + file));
    assert.ok(trail.drop > 390 && trail.drop < 420);
    assert.equal(trail.checkpoints.at(-1), trail.points.length - 1);
    for (let i = 0; i < trail.points.length; i++) {
      const p = trail.points[i];
      assert.ok(p.every(Number.isFinite));
      assert.ok(field.contains(p[0], p[2]));
      assert.ok(Math.abs(field.sample(p[0], p[2]) - p[1] + 0.045) < 0.001);
      assert.equal(trees.hits(p[0], p[2], p[1]), false);
    }
    for (let i = 1; i < trail.checkpoints.length; i++)
      assert.ok(trail.checkpoints[i] > trail.checkpoints[i - 1]);
  }
});
