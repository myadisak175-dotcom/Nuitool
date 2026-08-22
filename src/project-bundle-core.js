import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { validateProject } from './project.js';

export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_ASSET_BYTES = 80 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const IMPORT_PREFIX = 'user-model:';

function safeName(value, fallback = 'asset.glb') {
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 160);
  return cleaned || fallback;
}

export function collectImportedAssetIds(project) {
  const ids = new Set();
  for (const entity of Array.isArray(project?.entities) ? project.entities : []) {
    const type = String(entity?.type || '');
    if (type.startsWith(IMPORT_PREFIX) && type.length > IMPORT_PREFIX.length) {
      ids.add(type.slice(IMPORT_PREFIX.length));
    }
  }
  return [...ids];
}

export function createBundleArchive(projectInput, records = []) {
  const validated = validateProject(projectInput);
  if (!validated.ok) throw new Error(`Project is invalid: ${validated.error}`);
  const project = validated.project;
  const ids = collectImportedAssetIds(project);
  const byId = new Map((records || []).map((record) => [String(record.id), record]));
  const missing = ids.filter((id) => !byId.get(id)?.bytes);
  if (missing.length) throw new Error(`Portable export is missing ${missing.length} local 3D asset${missing.length === 1 ? '' : 's'}.`);

  let totalAssetBytes = 0;
  const manifestAssets = [];
  const files = {};

  for (const id of ids) {
    const record = byId.get(id);
    const bytes = record.bytes instanceof Uint8Array ? record.bytes : new Uint8Array(record.bytes);
    totalAssetBytes += bytes.byteLength;
    if (totalAssetBytes > MAX_BUNDLE_ASSET_BYTES) {
      throw new Error('Referenced local 3D assets exceed the 80 MB mobile bundle limit.');
    }
    const filename = safeName(record.filename || `${id}.glb`);
    const path = `assets/${encodeURIComponent(id)}.glb`;
    files[path] = bytes;
    manifestAssets.push({
      id,
      path,
      filename,
      name: String(record.name || filename.replace(/\.glb$/i, '')).slice(0, 80),
      size: bytes.byteLength,
      createdAt: record.createdAt || null
    });
  }

  const manifest = {
    format: 'nuitool-project-bundle',
    version: BUNDLE_VERSION,
    createdAt: new Date().toISOString(),
    projectFile: 'project.json',
    assetCount: manifestAssets.length,
    assets: manifestAssets
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['project.json'] = strToU8(JSON.stringify(project, null, 2));
  return zipSync(files, { level: 0 });
}

function parseJSONFile(files, path, label) {
  const bytes = files[path];
  if (!bytes) throw new Error(`${label} is missing from this Nuitool bundle.`);
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

export function readBundleArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.byteLength) throw new Error('This Nuitool bundle is empty.');
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('This Nuitool bundle is over the 100 MB mobile import limit.');

  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Could not open this Nuitool bundle.');
  }

  const manifest = parseJSONFile(files, 'manifest.json', 'manifest.json');
  if (manifest?.format !== 'nuitool-project-bundle' || manifest?.version !== BUNDLE_VERSION) {
    throw new Error('Unsupported Nuitool bundle format or version.');
  }
  const projectPath = String(manifest.projectFile || 'project.json');
  const projectInput = parseJSONFile(files, projectPath, projectPath);
  const validated = validateProject(projectInput);
  if (!validated.ok) throw new Error(`Project inside bundle is invalid: ${validated.error}`);

  const referencedIds = collectImportedAssetIds(validated.project);
  const manifestById = new Map((Array.isArray(manifest.assets) ? manifest.assets : []).map((asset) => [String(asset.id), asset]));
  const assets = [];
  for (const id of referencedIds) {
    const item = manifestById.get(id);
    if (!item?.path || !files[item.path]) throw new Error(`Bundle is missing required 3D asset: ${id}`);
    const assetBytes = files[item.path];
    assets.push({
      id,
      name: String(item.name || item.filename || 'Imported Model').slice(0, 80),
      filename: safeName(item.filename || `${id}.glb`),
      createdAt: item.createdAt || null,
      bytes: assetBytes
    });
  }

  return { manifest, project: validated.project, assets };
}
