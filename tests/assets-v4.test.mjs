import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
test('V4 terrain has local LOD chunks and no duplicate embedded aerial textures', async () => {
  await MeshoptDecoder.ready;
  for (const folder of ['public/assets', 'public/assets/lenzerheide'])
    for (const profile of ['high', 'mobile']) {
      const doc = await io.read(`${folder}/terrain-v4-${profile}.glb`),
        root = doc.getRoot(),
        nodes = root.listNodes().filter(n => n.getMesh()),
        tiers = new Set(nodes.map(n => n.getExtras().terrainTier));
      assert.deepEqual([...tiers].sort(), [0, 1, 2]);
      assert.equal(root.listTextures().length, 0);
      assert.ok(nodes.length > 100);
      assert.equal(nodes.filter(n => n.getExtras().terrainTier === 2).length, 1);
      for (const n of nodes)
        for (const p of n.getMesh().listPrimitives()) {
          assert.ok(p.getAttribute('POSITION').getArray().every(Number.isFinite));
          assert.ok(p.getAttribute('TEXCOORD_0'));
        }
    }
});
test('V4 trail chunks retain track UVs and trees retain actual photographic textures', async () => {
  for (const folder of ['public/assets', 'public/assets/lenzerheide']) {
    const doc = await io.read(`${folder}/corridor-v4-mobile.glb`);
    assert.equal(doc.getRoot().listTextures().length, 0);
    assert.ok(doc.getRoot().listMeshes().length > 10);
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) assert.ok(p.getAttribute('TEXCOORD_1'));
    const tree = await io.read(`${folder}/tree-v4-mobile.glb`);
    const leaves = tree
      .getRoot()
      .listMaterials()
      .find(m => /cluster|leaves|leaf/i.test(m.getName()));
    assert.ok(leaves.getBaseColorTexture()?.getImage().length > 1000);
  }
});
test('refined rider vertex attributes and bind matrices remain finite', async () => {
  const d = await io.read('public/assets/rider-v4.glb');
  for (const a of d.getRoot().listAccessors()) assert.ok(a.getArray().every(Number.isFinite), a.getName());
});
test('mountain panorama uses cullable chunks and a single shared aerial image', async () => {
  const d = await io.read('public/assets/lenzerheide/panorama-v4.glb');
  assert.ok(d.getRoot().listMeshes().length > 20);
  assert.equal(d.getRoot().listTextures().length, 1);
});
