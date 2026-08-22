import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { createStarterProject } from '../src/project.js';
import { collectImportedAssetIds, createBundleArchive, readBundleArchive } from '../src/project-bundle-core.js';

function projectWithLocalAsset(id = 'asset-abc') {
  const project = createStarterProject();
  project.meta.name = 'Portable Test';
  project.entities.push({
    id: 'custom-model',
    type: `user-model:${id}`,
    name: 'Custom Model',
    position: [2, 0, -3],
    rotationY: 20,
    scale: 1.1,
    behavior: 'stay',
    interaction: null
  });
  return project;
}

test('collectImportedAssetIds returns unique referenced My 3D ids', () => {
  const project = projectWithLocalAsset('same');
  project.entities.push({ ...project.entities.at(-1), id: 'custom-model-2' });
  assert.deepEqual(collectImportedAssetIds(project), ['same']);
});

test('portable bundle round trip preserves project and stable local asset id', () => {
  const project = projectWithLocalAsset('asset-abc');
  const modelBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const archive = createBundleArchive(project, [{
    id: 'asset-abc',
    name: 'Custom Model',
    filename: 'custom.glb',
    createdAt: '2026-08-22T00:00:00.000Z',
    bytes: modelBytes
  }]);
  const result = readBundleArchive(archive);
  assert.equal(result.project.meta.name, 'Portable Test');
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].id, 'asset-abc');
  assert.equal(result.assets[0].filename, 'custom.glb');
  assert.deepEqual([...result.assets[0].bytes], [...modelBytes]);
  assert.ok(result.project.entities.some((entity) => entity.type === 'user-model:asset-abc'));
});

test('portable export refuses a project whose referenced local asset is missing', () => {
  const project = projectWithLocalAsset('missing');
  assert.throws(() => createBundleArchive(project, []), /missing 1 local 3D asset/);
});

test('bundle import refuses manifest that does not match Nuitool bundle format', () => {
  const archive = zipSync({
    'manifest.json': strToU8(JSON.stringify({ format: 'other-format', version: 1, projectFile: 'project.json', assets: [] })),
    'project.json': strToU8(JSON.stringify(createStarterProject()))
  }, { level: 0 });
  assert.throws(() => readBundleArchive(archive), /Unsupported Nuitool bundle format/);
});

test('bundle import refuses a project that references an asset absent from archive', () => {
  const project = projectWithLocalAsset('missing-file');
  const manifest = {
    format: 'nuitool-project-bundle',
    version: 1,
    projectFile: 'project.json',
    assets: [{ id: 'missing-file', path: 'assets/missing-file.glb', filename: 'missing.glb', name: 'Missing' }]
  };
  const archive = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'project.json': strToU8(JSON.stringify(project))
  }, { level: 0 });
  assert.throws(() => readBundleArchive(archive), /missing required 3D asset/);
});
