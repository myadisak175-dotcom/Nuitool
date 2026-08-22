import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGlb } from '../src/asset-doctor.js';

function makeGlb(json) {
  const encoder = new TextEncoder();
  const raw = encoder.encode(JSON.stringify(json));
  const paddedLength = Math.ceil(raw.length / 4) * 4;
  const total = 20 + paddedLength;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(raw, 20);
  return new Blob([bytes], { type: 'model/gltf-binary' });
}

test('Asset Doctor reads GLB 2 structure and estimates triangles', async () => {
  const file = makeGlb({
    asset: { version: '2.0', generator: 'Nuitool Test' },
    accessors: [{ count: 3000 }],
    meshes: [{ primitives: [{ indices: 0, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
    materials: [{ name: 'Mat' }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 0 }],
    animations: [{ name: 'Idle' }],
    skins: []
  });
  Object.defineProperty(file, 'name', { value: 'test.glb' });
  const report = await inspectGlb(file);
  assert.equal(report.valid, true);
  assert.equal(report.metrics.glbVersion, 2);
  assert.equal(report.metrics.triangles, 1000);
  assert.equal(report.metrics.meshes, 1);
  assert.equal(report.metrics.materials, 1);
  assert.equal(report.metrics.animations, 1);
  assert.equal(report.status, 'ready');
});

test('Asset Doctor marks high triangle geometry as heavy', async () => {
  const file = makeGlb({
    asset: { version: '2.0' },
    accessors: [{ count: 900003 }],
    meshes: [{ primitives: [{ indices: 0 }] }]
  });
  const report = await inspectGlb(file);
  assert.equal(report.metrics.triangles, 300001);
  assert.equal(report.status, 'heavy');
  assert.ok(report.issues.some((issue) => issue.includes('triangles')));
});

test('Asset Doctor rejects data without a GLB header', async () => {
  const file = new Blob([new Uint8Array(32)]);
  await assert.rejects(() => inspectGlb(file), /GLB header/);
});
