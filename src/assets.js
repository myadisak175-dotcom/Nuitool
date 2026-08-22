import * as pc from 'playcanvas';

const materialCache = new Map();

function color(hex) {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value, 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function material(hex, options = {}) {
  const key = `${hex}:${options.opacity ?? 1}:${options.emissive ?? ''}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new pc.StandardMaterial();
  mat.diffuse = color(hex);
  mat.gloss = options.gloss ?? 0.18;
  mat.metalness = options.metalness ?? 0;
  if (options.emissive) {
    mat.emissive = color(options.emissive);
    mat.emissiveIntensity = options.emissiveIntensity ?? 1;
  }
  if (options.opacity != null && options.opacity < 1) {
    mat.opacity = options.opacity;
    mat.blendType = pc.BLEND_NORMAL;
    mat.depthWrite = false;
  }
  mat.update();
  materialCache.set(key, mat);
  return mat;
}

function part(parent, name, primitive, scale, position, hex, rotation = [0, 0, 0], options = {}) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: primitive,
    castShadows: options.castShadows ?? true,
    receiveShadows: options.receiveShadows ?? true
  });
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  entity.setLocalPosition(position[0], position[1], position[2]);
  entity.setLocalEulerAngles(rotation[0], rotation[1], rotation[2]);
  entity.render.material = material(hex, options);
  parent.addChild(entity);
  return entity;
}

function root(name) {
  return new pc.Entity(name);
}

function createTree(name = 'Tree') {
  const e = root(name);
  part(e, 'Trunk', 'cylinder', [0.45, 1.6, 0.45], [0, 0.8, 0], '#8c6244');
  part(e, 'Crown A', 'sphere', [2.0, 1.45, 1.9], [0, 2.35, 0], '#70a85f');
  part(e, 'Crown B', 'sphere', [1.45, 1.25, 1.5], [0.8, 2.65, 0.15], '#86b96a');
  part(e, 'Crown C', 'sphere', [1.35, 1.15, 1.4], [-0.85, 2.55, -0.1], '#5f9854');
  return e;
}

function createPine(name = 'Pine') {
  const e = root(name);
  part(e, 'Trunk', 'cylinder', [0.34, 1.5, 0.34], [0, 0.75, 0], '#76523c');
  part(e, 'Leaves Low', 'cone', [2.1, 2.5, 2.1], [0, 2.05, 0], '#467c61');
  part(e, 'Leaves High', 'cone', [1.55, 2.2, 1.55], [0, 3.15, 0], '#568e6c');
  return e;
}

function createRock(name = 'Rock') {
  const e = root(name);
  part(e, 'Rock', 'sphere', [1.65, 1.0, 1.35], [0, 0.52, 0], '#8e9299', [0, 17, -8]);
  part(e, 'Moss', 'sphere', [0.82, 0.25, 0.62], [-0.15, 1.1, 0.08], '#76936a');
  return e;
}

function createHouse(name = 'House') {
  const e = root(name);
  part(e, 'Body', 'box', [3.6, 2.6, 3.1], [0, 1.3, 0], '#e9d6b5');
  part(e, 'Roof', 'cone', [3.15, 2.2, 3.15], [0, 3.25, 0], '#a85f63');
  part(e, 'Door', 'box', [0.72, 1.35, 0.18], [0, 0.72, 1.62], '#6e5148');
  part(e, 'Window L', 'box', [0.72, 0.72, 0.15], [-1.0, 1.5, 1.63], '#87c6d4', [0,0,0], { emissive: '#4a8899', emissiveIntensity: 0.12 });
  part(e, 'Window R', 'box', [0.72, 0.72, 0.15], [1.0, 1.5, 1.63], '#87c6d4', [0,0,0], { emissive: '#4a8899', emissiveIntensity: 0.12 });
  return e;
}

function createCottage(name = 'Cottage') {
  const e = root(name);
  part(e, 'Body', 'box', [3.0, 2.1, 2.6], [0, 1.05, 0], '#c8d8b2');
  part(e, 'Roof', 'cone', [2.75, 1.85, 2.75], [0, 2.65, 0], '#6f7f68');
  part(e, 'Door', 'box', [0.68, 1.2, 0.16], [0.58, 0.62, 1.36], '#725647');
  part(e, 'Window', 'box', [0.78, 0.65, 0.14], [-0.65, 1.2, 1.36], '#aad7dc');
  part(e, 'Chimney', 'box', [0.42, 1.1, 0.42], [0.8, 3.1, 0], '#9a7d69');
  return e;
}

function createCrate(name = 'Crate') {
  const e = root(name);
  part(e, 'Crate', 'box', [1.3, 1.3, 1.3], [0, 0.65, 0], '#a87849');
  part(e, 'Band A', 'box', [1.36, 0.14, 1.36], [0, 0.28, 0], '#765033');
  part(e, 'Band B', 'box', [1.36, 0.14, 1.36], [0, 1.02, 0], '#765033');
  return e;
}

function createLamp(name = 'Lamp') {
  const e = root(name);
  part(e, 'Post', 'cylinder', [0.22, 2.7, 0.22], [0, 1.35, 0], '#4b4e5a');
  part(e, 'Light', 'sphere', [0.72, 0.72, 0.72], [0, 2.95, 0], '#ffd98a', [0,0,0], { emissive: '#ffd27a', emissiveIntensity: 1.1 });
  return e;
}

function createFlower(name = 'Flowers') {
  const e = root(name);
  const xs = [-0.45, 0, 0.45, -0.2, 0.28];
  const zs = [0.1, -0.28, 0.18, 0.45, 0.4];
  const petals = ['#f5a4ba', '#a8a7f3', '#f1cf75', '#f5a4ba', '#9bd7c4'];
  for (let i = 0; i < xs.length; i++) {
    part(e, `Stem ${i}`, 'cylinder', [0.06, 0.52, 0.06], [xs[i], 0.26, zs[i]], '#5e9859');
    part(e, `Flower ${i}`, 'sphere', [0.26, 0.16, 0.26], [xs[i], 0.58, zs[i]], petals[i]);
  }
  return e;
}

function createCharacter(name = 'Character', palette = 'mint') {
  const e = root(name);
  const shirt = palette === 'violet' ? '#8f82db' : palette === 'rose' ? '#d88491' : '#72bca8';
  part(e, 'Body', 'capsule', [0.78, 1.5, 0.78], [0, 0.98, 0], shirt);
  part(e, 'Head', 'sphere', [0.72, 0.72, 0.72], [0, 2.02, 0], '#f0c8a9');
  part(e, 'Hair', 'sphere', [0.76, 0.47, 0.76], [0, 2.28, -0.04], '#4c3c3e');
  part(e, 'Foot L', 'box', [0.28, 0.18, 0.52], [-0.23, 0.12, 0.1], '#403f50');
  part(e, 'Foot R', 'box', [0.28, 0.18, 0.52], [0.23, 0.12, 0.1], '#403f50');
  return e;
}

function createSlime(name = 'Slime') {
  const e = root(name);
  part(e, 'Body', 'sphere', [1.4, 0.9, 1.4], [0, 0.58, 0], '#74c7a0');
  part(e, 'Eye L', 'sphere', [0.12, 0.18, 0.08], [-0.32, 0.72, 0.68], '#28333c');
  part(e, 'Eye R', 'sphere', [0.12, 0.18, 0.08], [0.32, 0.72, 0.68], '#28333c');
  return e;
}

function createCoin(name = 'Coin') {
  const e = root(name);
  part(e, 'Coin', 'cylinder', [0.65, 0.16, 0.65], [0, 0.76, 0], '#f1c95e', [90, 0, 0], { metalness: 0.45, gloss: 0.65, emissive: '#6b4d00', emissiveIntensity: 0.08 });
  return e;
}

function createDoor(name = 'Door') {
  const e = root(name);
  part(e, 'Frame', 'box', [1.8, 2.7, 0.28], [0, 1.35, 0], '#6d5142');
  part(e, 'Door', 'box', [1.45, 2.35, 0.34], [0, 1.2, 0.12], '#a87852');
  part(e, 'Knob', 'sphere', [0.12, 0.12, 0.12], [0.5, 1.2, 0.35], '#e3c26a', [0,0,0], { metalness: .6 });
  return e;
}

export const ASSET_CATALOG = [
  { type: 'tree', icon: '🌳', name: 'Round Tree', category: 'Nature', subtitle: 'soft canopy' },
  { type: 'pine', icon: '🌲', name: 'Pine', category: 'Nature', subtitle: 'evergreen' },
  { type: 'rock', icon: '🪨', name: 'Moss Rock', category: 'Nature', subtitle: 'ground prop' },
  { type: 'flowers', icon: '🌸', name: 'Flowers', category: 'Nature', subtitle: 'small cluster' },
  { type: 'house', icon: '🏠', name: 'Village House', category: 'Buildings', subtitle: 'starter home' },
  { type: 'cottage', icon: '🏡', name: 'Cottage', category: 'Buildings', subtitle: 'cozy variant' },
  { type: 'door', icon: '🚪', name: 'Door', category: 'Props', subtitle: 'logic-ready' },
  { type: 'crate', icon: '📦', name: 'Crate', category: 'Props', subtitle: 'simple obstacle' },
  { type: 'lamp', icon: '💡', name: 'Lamp', category: 'Props', subtitle: 'glowing prop' },
  { type: 'npc', icon: '🧍', name: 'NPC', category: 'Characters', subtitle: 'behavior-ready' },
  { type: 'slime', icon: '🟢', name: 'Slime', category: 'Characters', subtitle: 'enemy starter' },
  { type: 'coin', icon: '🪙', name: 'Coin', category: 'Gameplay', subtitle: 'collectible' }
];

export function createAsset(type, name) {
  switch (type) {
    case 'tree': return createTree(name);
    case 'pine': return createPine(name);
    case 'rock': return createRock(name);
    case 'flowers': return createFlower(name);
    case 'house': return createHouse(name);
    case 'cottage': return createCottage(name);
    case 'crate': return createCrate(name);
    case 'lamp': return createLamp(name);
    case 'npc': return createCharacter(name, 'violet');
    case 'slime': return createSlime(name);
    case 'coin': return createCoin(name);
    case 'door': return createDoor(name);
    case 'player': return createCharacter(name, 'mint');
    default: return createCrate(name || 'Object');
  }
}

export function createSelectionMarker() {
  const e = new pc.Entity('Selection Marker');
  e.addComponent('render', { type: 'cylinder', castShadows: false, receiveShadows: false });
  e.setLocalScale(2.2, 0.035, 2.2);
  e.render.material = material('#9c8cff', { opacity: 0.38, emissive: '#7f70ff', emissiveIntensity: 0.7 });
  e.enabled = false;
  return e;
}
