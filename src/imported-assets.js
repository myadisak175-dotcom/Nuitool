import * as pc from 'playcanvas';
import { ASSET_CATALOG } from './assets.js';

const DB_NAME = 'nuitool-assets';
const DB_VERSION = 1;
const STORE_NAME = 'models';
const TYPE_PREFIX = 'user-model:';
const MAX_GLB_BYTES = 25 * 1024 * 1024;
const containerCache = new Map();
let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local asset storage is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local asset storage.'));
  });
  return dbPromise;
}

async function transact(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let request;
    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local asset storage request failed.'));
    } else {
      tx.oncomplete = () => resolve();
    }
    tx.onerror = () => reject(tx.error || new Error('Local asset storage transaction failed.'));
  });
}

function modelType(id) {
  return `${TYPE_PREFIX}${id}`;
}

function assetIdFromType(type) {
  return String(type || '').startsWith(TYPE_PREFIX) ? String(type).slice(TYPE_PREFIX.length) : null;
}

export function isImportedType(type) {
  return Boolean(assetIdFromType(type));
}

function prettySize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function catalogEntry(record) {
  return {
    type: modelType(record.id),
    icon: '🧩',
    name: record.name,
    category: 'My 3D',
    subtitle: `${prettySize(record.size)} · local`
  };
}

function registerRecord(record) {
  const type = modelType(record.id);
  const existing = ASSET_CATALOG.find((asset) => asset.type === type);
  if (existing) Object.assign(existing, catalogEntry(record));
  else ASSET_CATALOG.push(catalogEntry(record));
  window.dispatchEvent(new CustomEvent('nuitool:asset-library-change', { detail: { type, record } }));
  return type;
}

export async function listImportedModels() {
  try {
    const records = await transact('readonly', (store) => store.getAll());
    return (records || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch {
    return [];
  }
}

export async function initializeImportedAssets() {
  const records = await listImportedModels();
  for (const record of records) registerRecord(record);
  return records;
}

export async function importGlbFile(file) {
  if (!(file instanceof Blob)) throw new Error('Choose a GLB file first.');
  const filename = String(file.name || 'model.glb');
  if (!filename.toLowerCase().endsWith('.glb')) throw new Error('Nuitool v0.11 accepts .glb files only.');
  if (!file.size) throw new Error('This GLB file is empty.');
  if (file.size > MAX_GLB_BYTES) throw new Error('This GLB is over 25 MB. Optimize it before importing.');

  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const record = {
    id,
    name: filename.replace(/\.glb$/i, '').slice(0, 80) || 'Imported Model',
    filename: filename.slice(0, 160),
    size: file.size,
    mime: file.type || 'model/gltf-binary',
    createdAt: new Date().toISOString(),
    blob: file
  };
  await transact('readwrite', (store) => store.put(record));
  const type = registerRecord(record);
  return { type, record };
}

export async function getImportedModel(id) {
  try {
    return await transact('readonly', (store) => store.get(id));
  } catch {
    return null;
  }
}

export async function deleteImportedModel(id) {
  await transact('readwrite', (store) => store.delete(id));
  containerCache.delete(id);
  const type = modelType(id);
  const index = ASSET_CATALOG.findIndex((asset) => asset.type === type);
  if (index >= 0) ASSET_CATALOG.splice(index, 1);
  window.dispatchEvent(new CustomEvent('nuitool:asset-library-change', { detail: { type, deleted: true } }));
}

function loadContainerAsset(app, id) {
  if (containerCache.has(id)) return containerCache.get(id);
  const promise = (async () => {
    const record = await getImportedModel(id);
    if (!record?.blob) throw new Error('Imported model is missing from this device.');
    const objectUrl = URL.createObjectURL(record.blob);
    try {
      return await new Promise((resolve, reject) => {
        app.assets.loadFromUrlAndFilename(objectUrl, record.filename || 'model.glb', 'container', (error, asset) => {
          if (error || !asset?.resource) reject(new Error(error || 'Could not load this GLB.'));
          else resolve(asset);
        });
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  })();
  containerCache.set(id, promise);
  promise.catch(() => containerCache.delete(id));
  return promise;
}

function normalizeModelOnGround(app, model, name) {
  const wrapper = new pc.Entity(name || 'Imported Model');
  wrapper.addChild(model);
  app.root.addChild(wrapper);

  let bounds = null;
  for (const render of model.findComponents('render')) {
    for (const meshInstance of render.meshInstances || []) {
      const aabb = meshInstance.aabb;
      if (!aabb) continue;
      if (!bounds) bounds = aabb.clone();
      else bounds.add(aabb);
    }
  }

  if (bounds) {
    const width = bounds.halfExtents.x * 2;
    const height = bounds.halfExtents.y * 2;
    const depth = bounds.halfExtents.z * 2;
    const largest = Math.max(width, height, depth, 0.0001);
    const factor = pc.math.clamp(3 / largest, 0.001, 1000);
    const min = bounds.getMin();
    const center = bounds.center;
    model.setLocalScale(factor, factor, factor);
    model.setLocalPosition(-center.x * factor, -min.y * factor, -center.z * factor);
  }

  app.root.removeChild(wrapper);
  return wrapper;
}

export async function createImportedModelEntity(app, type, name) {
  const id = assetIdFromType(type);
  if (!id) throw new Error('Not an imported model type.');
  const asset = await loadContainerAsset(app, id);
  const model = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
  return normalizeModelOnGround(app, model, name);
}

export function importedAssetId(type) {
  return assetIdFromType(type);
}
