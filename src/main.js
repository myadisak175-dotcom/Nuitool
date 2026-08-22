import * as pc from 'playcanvas';
import './styles.css';
import { ASSET_CATALOG, createAsset, createSelectionMarker } from './assets.js';
import { ProjectStore } from './project.js';

const canvas = document.querySelector('#app-canvas');
const panel = document.querySelector('#panel');
const healthPill = document.querySelector('#health-pill');
const selectionPill = document.querySelector('#selection-pill');
const placementHint = document.querySelector('#placement-hint');
const bottomNav = document.querySelector('#bottom-nav');
const playBtn = document.querySelector('#play-btn');
const editModeBtn = document.querySelector('#edit-mode-btn');
const modeLabel = document.querySelector('#mode-label');
const toastEl = document.querySelector('#toast');
const joystick = document.querySelector('#joystick');
const joystickKnob = document.querySelector('#joystick-knob');

const store = new ProjectStore();
let selectedId = null;
let activePlacement = null;
let activePanel = null;
let moveSelectedMode = false;
let playMode = false;
let toastTimer = 0;
let lastInteractionKey = '';
let fps = 60;
let fpsAccumulator = 0;
let fpsFrames = 0;
let healthTimer = 0;

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  touch: new pc.TouchDevice(canvas),
  keyboard: new pc.Keyboard(window)
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.65, 0.7, 0.75);
app.scene.exposure = 1.15;
app.start();

const ground = new pc.Entity('Ground');
ground.addComponent('render', { type: 'box', castShadows: false, receiveShadows: true });
ground.setLocalScale(80, 0.18, 80);
ground.setLocalPosition(0, -0.1, 0);
app.root.addChild(ground);

const grid = new pc.Entity('Editor Grid');
grid.addComponent('render', { type: 'plane', castShadows: false, receiveShadows: false });
grid.setLocalScale(80, 1, 80);
grid.setLocalPosition(0, 0.005, 0);
app.root.addChild(grid);
const gridMat = new pc.StandardMaterial();
gridMat.diffuse = new pc.Color(1, 1, 1);
gridMat.opacity = 0.035;
gridMat.blendType = pc.BLEND_NORMAL;
gridMat.depthWrite = false;
gridMat.update();
grid.render.material = gridMat;

const sun = new pc.Entity('Sun');
sun.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 0.95, 0.84),
  intensity: 1.25,
  castShadows: true,
  shadowDistance: 32,
  shadowResolution: 1024
});
sun.setEulerAngles(52, 28, 0);
app.root.addChild(sun);

const fill = new pc.Entity('Fill Light');
fill.addComponent('light', {
  type: 'directional',
  color: new pc.Color(0.56, 0.68, 1),
  intensity: 0.3,
  castShadows: false
});
fill.setEulerAngles(35, 205, 0);
app.root.addChild(fill);

const camera = new pc.Entity('Camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.66, 0.83, 0.95),
  fov: 50,
  nearClip: 0.1,
  farClip: 300
});
app.root.addChild(camera);

const selectionMarker = createSelectionMarker();
const placementMarker = createSelectionMarker();
placementMarker.name = 'Placement Marker';
selectionMarker.enabled = false;
placementMarker.enabled = false;
app.root.addChild(selectionMarker);
app.root.addChild(placementMarker);

const entityViews = new Map();
const runtime = new Map();

let orbitYaw = 36;
let orbitPitch = 34;
let orbitDistance = 18;
const orbitTarget = new pc.Vec3(0, 0.7, 0);

function updateCamera() {
  const yaw = orbitYaw * pc.math.DEG_TO_RAD;
  const pitch = orbitPitch * pc.math.DEG_TO_RAD;
  const horizontal = Math.cos(pitch) * orbitDistance;
  camera.setPosition(
    orbitTarget.x + Math.sin(yaw) * horizontal,
    orbitTarget.y + Math.sin(pitch) * orbitDistance,
    orbitTarget.z + Math.cos(yaw) * horizontal
  );
  camera.lookAt(orbitTarget);
}
updateCamera();

function makeGroundMaterial(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  mat.gloss = 0.08;
  mat.update();
  return mat;
}

const groundMaterials = {
  meadow: makeGroundMaterial('#7fa96b'),
  dirt: makeGroundMaterial('#9a7656'),
  sand: makeGroundMaterial('#d7c08c'),
  stone: makeGroundMaterial('#8d9696')
};

const skies = {
  day: { clear: new pc.Color(0.64, 0.82, 0.96), ambient: new pc.Color(0.65, 0.7, 0.75), sun: new pc.Color(1, 0.95, 0.84), intensity: 1.25 },
  sunset: { clear: new pc.Color(0.92, 0.59, 0.53), ambient: new pc.Color(0.62, 0.48, 0.55), sun: new pc.Color(1, 0.68, 0.46), intensity: 1.1 },
  night: { clear: new pc.Color(0.06, 0.09, 0.18), ambient: new pc.Color(0.18, 0.22, 0.36), sun: new pc.Color(0.48, 0.58, 0.9), intensity: 0.45 }
};

function applyWorld() {
  const world = store.project.world;
  ground.render.material = groundMaterials[world.ground] || groundMaterials.meadow;
  const sky = skies[world.sky] || skies.day;
  camera.camera.clearColor = sky.clear;
  app.scene.ambientLight = sky.ambient;
  sun.light.color = sky.sun;
  sun.light.intensity = sky.intensity;
}

function destroyEntityViews() {
  for (const entity of entityViews.values()) entity.destroy();
  entityViews.clear();
  runtime.clear();
}

function createEntityView(descriptor) {
  const entity = createAsset(descriptor.type, descriptor.name);
  entity.nuitoolId = descriptor.id;
  entity.setPosition(descriptor.position[0], descriptor.position[1], descriptor.position[2]);
  entity.setEulerAngles(0, descriptor.rotationY || 0, 0);
  entity.setLocalScale(descriptor.scale || 1, descriptor.scale || 1, descriptor.scale || 1);
  app.root.addChild(entity);
  entityViews.set(descriptor.id, entity);
  runtime.set(descriptor.id, {
    wanderTimer: Math.random() * 2,
    wanderTarget: new pc.Vec3(descriptor.position[0], 0, descriptor.position[2]),
    origin: new pc.Vec3(descriptor.position[0], 0, descriptor.position[2]),
    bob: Math.random() * Math.PI * 2
  });
}

function syncScene() {
  destroyEntityViews();
  for (const descriptor of store.project.entities) createEntityView(descriptor);
  applyWorld();
  updateSelectionMarker();
}

function iconFor(type) {
  if (type === 'player') return '🎮';
  return ASSET_CATALOG.find((asset) => asset.type === type)?.icon || '◆';
}

function updateSelectionMarker() {
  if (playMode || !selectedId || selectedId === 'player') {
    selectionMarker.enabled = false;
    return;
  }
  const descriptor = store.getEntity(selectedId);
  if (!descriptor) {
    selectedId = null;
    selectionMarker.enabled = false;
    selectionPill.classList.add('hidden');
    return;
  }
  selectionMarker.enabled = true;
  selectionMarker.setPosition(descriptor.position[0], 0.04, descriptor.position[2]);
  const size = Math.max(0.8, descriptor.scale || 1);
  selectionMarker.setLocalScale(2.2 * size, 0.035, 2.2 * size);
  selectionPill.textContent = `${iconFor(descriptor.type)} ${descriptor.name}`;
  selectionPill.classList.remove('hidden');
}

store.subscribe(() => {
  if (!playMode) syncScene();
  if (activePanel === 'world') renderWorldPanel();
  if (activePanel === 'logic') renderLogicPanel();
});
syncScene();

function showToast(message, duration = 1900) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), duration);
}

function openPanel(kind) {
  if (playMode) return;
  if (activePanel === kind && !panel.classList.contains('hidden')) {
    closePanel();
    return;
  }
  activePanel = kind;
  panel.classList.remove('hidden');
  if (kind === 'world') renderWorldPanel();
  if (kind === 'add') renderAddPanel();
  if (kind === 'logic') renderLogicPanel();
}

function closePanel() {
  activePanel = null;
  panel.classList.add('hidden');
}

function panelHeader(title, subtitle) {
  return `<div class="panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="close-btn" data-close>×</button></div>`;
}

function bindClose() {
  panel.querySelector('[data-close]')?.addEventListener('click', closePanel);
}

function renderWorldPanel() {
  const { ground: groundType, sky } = store.project.world;
  const grounds = [['meadow', '🌱', 'Meadow'], ['dirt', '🟫', 'Dirt'], ['sand', '🏖️', 'Sand'], ['stone', '🪨', 'Stone']];
  const skyOptions = [['day', '☀️', 'Day'], ['sunset', '🌇', 'Sunset'], ['night', '🌙', 'Night']];
  panel.innerHTML = `${panelHeader('World', 'แตะเพื่อเปลี่ยนบรรยากาศของโลก')}
    <div class="section-title">Ground</div>
    <div class="choice-grid">${grounds.map(([id, icon, name]) => `<button class="choice ${groundType === id ? 'active' : ''}" data-ground="${id}"><span>${icon}</span><strong>${name}</strong></button>`).join('')}</div>
    <div class="section-title">Environment</div>
    <div class="choice-grid">${skyOptions.map(([id, icon, name]) => `<button class="choice ${sky === id ? 'active' : ''}" data-sky="${id}"><span>${icon}</span><strong>${name}</strong></button>`).join('')}</div>
    <div class="section-title">World tools</div>
    <button class="wide-btn" data-focus>◎ Focus world</button>`;
  bindClose();
  panel.querySelectorAll('[data-ground]').forEach((button) => button.addEventListener('click', () => store.setWorld({ ground: button.dataset.ground })));
  panel.querySelectorAll('[data-sky]').forEach((button) => button.addEventListener('click', () => store.setWorld({ sky: button.dataset.sky })));
  panel.querySelector('[data-focus]')?.addEventListener('click', () => {
    orbitTarget.set(0, .7, 0); orbitDistance = 18; orbitYaw = 36; orbitPitch = 34; updateCamera(); closePanel();
  });
}

function startPlacement(asset) {
  moveSelectedMode = false;
  activePlacement = asset;
  placementMarker.enabled = true;
  placementMarker.setPosition(orbitTarget.x, 0.04, orbitTarget.z);
  placementMarker.setLocalScale(2.1, 0.035, 2.1);
  placementHint.textContent = `${asset.icon} ลากหาตำแหน่ง แล้วปล่อยเพื่อวาง ${asset.name}`;
  placementHint.classList.remove('hidden');
  closePanel();
  showToast(`กำลังวาง ${asset.name}`);
}

function cancelPlacement(message = 'ยกเลิกการวาง') {
  activePlacement = null;
  placementMarker.enabled = false;
  placementHint.classList.add('hidden');
  showToast(message);
}

function renderAddPanel() {
  panel.innerHTML = `${panelHeader('Add', 'เลือกของ แล้วลากไปวางบนพื้น')}
    <div class="asset-grid">${ASSET_CATALOG.map((asset) => `<button class="asset-card" data-asset="${asset.type}"><span>${asset.icon}</span><strong>${asset.name}</strong><small>${asset.category}</small></button>`).join('')}</div>`;
  bindClose();
  panel.querySelectorAll('[data-asset]').forEach((button) => button.addEventListener('click', () => {
    const asset = ASSET_CATALOG.find((item) => item.type === button.dataset.asset);
    if (asset) startPlacement(asset);
  }));
}

function focusSelected() {
  const entity = selectedId ? store.getEntity(selectedId) : null;
  if (!entity) return;
  orbitTarget.set(entity.position[0], 0.8, entity.position[2]);
  orbitDistance = Math.max(8, Math.min(16, 10 + (entity.scale || 1) * 2));
  updateCamera();
  closePanel();
}

function beginMoveSelected() {
  const entity = selectedId ? store.getEntity(selectedId) : null;
  if (!entity || entity.id === 'player') return;
  activePlacement = null;
  placementMarker.enabled = false;
  moveSelectedMode = true;
  selectionMarker.enabled = true;
  placementHint.textContent = `✋ ลาก ${entity.name} ไปตำแหน่งใหม่ แล้วปล่อย`;
  placementHint.classList.remove('hidden');
  closePanel();
  showToast('ลากบนพื้นเพื่อย้ายของ');
}

function renderLogicPanel() {
  const entity = selectedId ? store.getEntity(selectedId) : null;
  if (!entity || entity.id === 'player') {
    panel.innerHTML = `${panelHeader('Logic', 'แตะ Object หรือ Character ในโลกก่อน')}
      <div class="logic-card"><div class="logic-line"><div class="logic-key">WHEN</div><div class="logic-value">Player approaches Mia</div></div><div class="logic-line"><div class="logic-key">DO</div><div class="logic-value">Talk</div></div></div>
      <p style="opacity:.58;font-size:12px;line-height:1.55;margin:12px 2px 0">ตอนนี้ใช้ Behavior ง่าย ๆ ก่อน ระบบ WHEN → IF → DO เต็มรูปแบบจะต่อจาก Project Schema เดียวกัน</p>`;
    bindClose();
    return;
  }

  const character = entity.type === 'npc' || entity.type === 'slime';
  const talk = entity.interaction?.type === 'talk';
  panel.innerHTML = `${panelHeader(`${iconFor(entity.type)} ${entity.name}`, 'แก้จากคำสั่งง่าย ๆ บนมือถือ')}
    <div class="quick-edit-row"><button class="wide-btn accent" data-move-ground>✋ Move on ground</button><button class="wide-btn" data-focus-selected>◎ Focus</button></div>
    <div class="section-title">Fine tune</div>
    <div class="toolbar-row"><button data-move="left">←</button><button data-move="up">↑</button><button data-move="down">↓</button><button data-move="right">→</button></div>
    <div class="property-row"><div><label>Rotation</label><small>${Math.round(entity.rotationY || 0)}°</small></div><div class="segmented"><button data-rotate="-15">−15°</button><button data-rotate="15">+15°</button></div></div>
    <div class="property-row"><div><label>Size</label><small>${Number(entity.scale || 1).toFixed(2)}×</small></div><div class="segmented"><button data-scale="0.9">−</button><button data-scale="1.1">＋</button></div></div>
    ${character ? `<div class="section-title">Movement</div><div class="choice-grid"><button class="choice ${entity.behavior === 'stay' ? 'active' : ''}" data-behavior="stay"><span>📍</span><strong>Stay</strong></button><button class="choice ${entity.behavior === 'wander' ? 'active' : ''}" data-behavior="wander"><span>🚶</span><strong>Walk around</strong></button><button class="choice ${entity.behavior === 'follow' ? 'active' : ''}" data-behavior="follow"><span>🧲</span><strong>Follow</strong></button></div>` : ''}
    ${entity.type === 'npc' ? `<div class="section-title">Interaction</div><div class="property-row"><div><label>Talk when near</label><small>${talk ? entity.interaction.text : 'ปิดอยู่'}</small></div><div class="segmented"><button data-talk="on" class="${talk ? 'active' : ''}">ON</button><button data-talk="off" class="${!talk ? 'active' : ''}">OFF</button></div></div>` : ''}
    <div class="section-title">Object</div>
    <div class="object-actions"><button class="wide-btn" data-duplicate>⧉ Copy</button><button class="wide-btn danger" data-delete>Delete</button></div>`;
  bindClose();
  panel.querySelector('[data-move-ground]')?.addEventListener('click', beginMoveSelected);
  panel.querySelector('[data-focus-selected]')?.addEventListener('click', focusSelected);
  panel.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
    const current = store.getEntity(entity.id);
    const p = [...current.position];
    const step = .6;
    if (button.dataset.move === 'left') p[0] -= step;
    if (button.dataset.move === 'right') p[0] += step;
    if (button.dataset.move === 'up') p[2] -= step;
    if (button.dataset.move === 'down') p[2] += step;
    store.updateEntity(entity.id, { position: p });
  }));
  panel.querySelectorAll('[data-rotate]').forEach((button) => button.addEventListener('click', () => {
    const current = store.getEntity(entity.id);
    store.updateEntity(entity.id, { rotationY: (current.rotationY || 0) + Number(button.dataset.rotate) });
  }));
  panel.querySelectorAll('[data-scale]').forEach((button) => button.addEventListener('click', () => {
    const current = store.getEntity(entity.id);
    const next = Math.min(3, Math.max(.35, (current.scale || 1) * Number(button.dataset.scale)));
    store.updateEntity(entity.id, { scale: Number(next.toFixed(2)) });
  }));
  panel.querySelectorAll('[data-behavior]').forEach((button) => button.addEventListener('click', () => store.updateEntity(entity.id, { behavior: button.dataset.behavior })));
  panel.querySelectorAll('[data-talk]').forEach((button) => button.addEventListener('click', () => {
    store.updateEntity(entity.id, { interaction: button.dataset.talk === 'on' ? { type: 'talk', text: entity.interaction?.text || 'สวัสดี!' } : null });
  }));
  panel.querySelector('[data-duplicate]')?.addEventListener('click', () => {
    const copy = store.duplicateEntity(entity.id);
    if (copy) { selectedId = copy.id; updateSelectionMarker(); renderLogicPanel(); showToast('คัดลอกแล้ว'); }
  });
  panel.querySelector('[data-delete]')?.addEventListener('click', () => {
    if (store.removeEntity(entity.id)) { selectedId = null; closePanel(); updateSelectionMarker(); showToast('ลบแล้ว'); }
  });
}

function openProjectMenu() {
  if (playMode) return;
  activePanel = 'menu';
  panel.classList.remove('hidden');
  const safeName = store.project.meta.name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  panel.innerHTML = `${panelHeader('Project', `${store.project.entities.length} objects • autosaved on this device`)}
    <div class="section-title">Game name</div>
    <div class="rename-row"><input data-project-name value="${safeName}" maxlength="80" aria-label="Game name"><button data-save-name>Save</button></div>
    <div class="menu-sheet project-actions">
      <button data-export>⇩ Export project JSON</button>
      <button data-reset>↺ Reset starter world</button>
      <button data-about>ⓘ About Nuitool v0.4</button>
    </div>`;
  bindClose();
  const saveName = () => {
    const input = panel.querySelector('[data-project-name]');
    store.setProjectName(input?.value || 'Untitled Game');
    showToast('ชื่อเกมบันทึกแล้ว ✓');
    openProjectMenu();
  };
  panel.querySelector('[data-save-name]')?.addEventListener('click', saveName);
  panel.querySelector('[data-project-name]')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveName(); });
  panel.querySelector('[data-export]')?.addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${store.project.meta.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'nuitool-project'}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported project JSON');
  });
  panel.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('Reset starter world? งานปัจจุบันจะถูกแทนที่ แต่ Undo ยังใช้ได้')) return;
    store.reset(); selectedId = null; closePanel(); showToast('Starter world restored');
  });
  panel.querySelector('[data-about]')?.addEventListener('click', () => showToast('Nuitool v0.4 • Touch-first game creator'));
}

function screenToGround(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const near = camera.camera.screenToWorld(x, y, camera.camera.nearClip);
  const far = camera.camera.screenToWorld(x, y, Math.min(camera.camera.farClip, 120));
  const direction = far.clone().sub(near);
  if (Math.abs(direction.y) < 0.00001) return null;
  const t = -near.y / direction.y;
  if (t < 0) return null;
  return near.clone().add(direction.mulScalar(t));
}

function pickNearest(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  let bestDistance = 56;
  for (const descriptor of store.project.entities) {
    if (descriptor.id === 'player') continue;
    const view = entityViews.get(descriptor.id);
    if (!view) continue;
    const screen = camera.camera.worldToScreen(view.getPosition());
    const distance = Math.hypot(screen.x - x, screen.y - y);
    if (distance < bestDistance) { best = descriptor; bestDistance = distance; }
  }
  return best;
}

function previewGroundPoint(clientX, clientY) {
  const point = screenToGround(clientX, clientY);
  if (!point) return null;
  const x = Number(pc.math.clamp(point.x, -38, 38).toFixed(2));
  const z = Number(pc.math.clamp(point.z, -38, 38).toFixed(2));
  if (activePlacement) {
    placementMarker.enabled = true;
    placementMarker.setPosition(x, 0.04, z);
  }
  if (moveSelectedMode && selectedId) {
    selectionMarker.enabled = true;
    selectionMarker.setPosition(x, 0.04, z);
  }
  return { x, z };
}

const pointers = new Map();
let gestureMoved = false;
let pointerStart = null;
let lastPinchDistance = null;
let lastGroundPreview = null;

canvas.addEventListener('pointerdown', (event) => {
  if (playMode) return;
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  pointerStart = { x: event.clientX, y: event.clientY, yaw: orbitYaw, pitch: orbitPitch };
  gestureMoved = false;
  lastGroundPreview = (activePlacement || moveSelectedMode) ? previewGroundPoint(event.clientX, event.clientY) : null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    lastPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (playMode || !pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinchDistance) {
      orbitDistance = pc.math.clamp(orbitDistance - (distance - lastPinchDistance) * 0.025, 7, 36);
      updateCamera();
    }
    lastPinchDistance = distance;
    gestureMoved = true;
    return;
  }
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) > 7) gestureMoved = true;

  if (activePlacement || moveSelectedMode) {
    lastGroundPreview = previewGroundPoint(event.clientX, event.clientY);
    return;
  }

  if (gestureMoved) {
    orbitYaw = pointerStart.yaw - dx * .22;
    orbitPitch = pc.math.clamp(pointerStart.pitch + dy * .18, 18, 70);
    updateCamera();
  }
});

canvas.addEventListener('pointerup', (event) => {
  if (playMode) return;
  const wasTwoFinger = pointers.size > 1;
  pointers.delete(event.pointerId);
  if (!pointers.size) lastPinchDistance = null;
  if (wasTwoFinger) { pointerStart = null; return; }

  if (activePlacement) {
    const point = lastGroundPreview || previewGroundPoint(event.clientX, event.clientY);
    if (point) {
      const entity = store.addEntity(activePlacement.type, activePlacement.name, [point.x, 0, point.z]);
      selectedId = entity.id;
      activePlacement = null;
      placementMarker.enabled = false;
      placementHint.classList.add('hidden');
      updateSelectionMarker();
      showToast(`${iconFor(entity.type)} วาง ${entity.name} แล้ว`);
    }
    pointerStart = null;
    lastGroundPreview = null;
    return;
  }

  if (moveSelectedMode) {
    const point = lastGroundPreview || previewGroundPoint(event.clientX, event.clientY);
    const entity = selectedId ? store.getEntity(selectedId) : null;
    moveSelectedMode = false;
    placementHint.classList.add('hidden');
    if (point && entity) {
      store.updateEntity(entity.id, { position: [point.x, entity.position[1], point.z] });
      showToast(`ย้าย ${entity.name} แล้ว`);
      activePanel = 'logic';
      panel.classList.remove('hidden');
      renderLogicPanel();
    } else {
      updateSelectionMarker();
    }
    pointerStart = null;
    lastGroundPreview = null;
    return;
  }

  if (!gestureMoved) {
    const picked = pickNearest(event.clientX, event.clientY);
    selectedId = picked?.id || null;
    updateSelectionMarker();
    if (picked) {
      activePanel = 'logic';
      panel.classList.remove('hidden');
      renderLogicPanel();
    } else {
      closePanel();
    }
  }
  pointerStart = null;
});

canvas.addEventListener('pointercancel', (event) => {
  pointers.delete(event.pointerId);
  pointerStart = null;
  lastGroundPreview = null;
  if (!pointers.size) lastPinchDistance = null;
});

bottomNav.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.panel === 'add' && activePlacement) {
    cancelPlacement();
    return;
  }
  if (moveSelectedMode) {
    moveSelectedMode = false;
    placementHint.classList.add('hidden');
    updateSelectionMarker();
  }
  openPanel(button.dataset.panel);
}));

document.querySelector('#undo-btn').addEventListener('click', () => { if (!playMode && store.undo()) showToast('Undo'); });
document.querySelector('#redo-btn').addEventListener('click', () => { if (!playMode && store.redo()) showToast('Redo'); });
document.querySelector('#menu-btn').addEventListener('click', openProjectMenu);

const joystickState = { x: 0, y: 0, pointerId: null };
function setJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const max = 34;
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = dx / length * max; dy = dy / length * max; }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joystickState.x = dx / max;
  joystickState.y = dy / max;
}
joystick.addEventListener('pointerdown', (event) => {
  joystickState.pointerId = event.pointerId;
  joystick.setPointerCapture?.(event.pointerId);
  setJoystick(event);
});
joystick.addEventListener('pointermove', (event) => { if (joystickState.pointerId === event.pointerId) setJoystick(event); });
function releaseJoystick(event) {
  if (joystickState.pointerId !== event.pointerId) return;
  joystickState.pointerId = null;
  joystickState.x = 0;
  joystickState.y = 0;
  joystickKnob.style.transform = 'translate(0,0)';
}
joystick.addEventListener('pointerup', releaseJoystick);
joystick.addEventListener('pointercancel', releaseJoystick);

function enterPlayMode() {
  if (playMode) return;
  playMode = true;
  closePanel();
  activePlacement = null;
  moveSelectedMode = false;
  placementMarker.enabled = false;
  placementHint.classList.add('hidden');
  selectionMarker.enabled = false;
  selectionPill.classList.add('hidden');
  bottomNav.classList.add('hidden');
  document.querySelector('.topbar').classList.add('hidden');
  healthPill.classList.add('hidden');
  joystick.classList.remove('hidden');
  editModeBtn.classList.remove('hidden');
  modeLabel.textContent = 'Play mode';
  lastInteractionKey = '';
  const player = entityViews.get('player');
  if (player) {
    orbitTarget.copy(player.getPosition()).add(new pc.Vec3(0, 1, 0));
    orbitDistance = 10;
    orbitPitch = 28;
    updateCamera();
  }
}

function exitPlayMode() {
  if (!playMode) return;
  playMode = false;
  joystick.classList.add('hidden');
  editModeBtn.classList.add('hidden');
  bottomNav.classList.remove('hidden');
  document.querySelector('.topbar').classList.remove('hidden');
  healthPill.classList.remove('hidden');
  modeLabel.textContent = 'Edit mode';
  orbitDistance = 18;
  orbitPitch = 34;
  orbitTarget.set(0, .7, 0);
  syncScene();
  updateCamera();
  showToast('กลับสู่ Edit mode');
}

playBtn.addEventListener('click', enterPlayMode);
editModeBtn.addEventListener('click', exitPlayMode);

function updatePlayer(dt) {
  const player = entityViews.get('player');
  if (!player) return;
  const inputLength = Math.hypot(joystickState.x, joystickState.y);
  if (inputLength > .08) {
    const forward = camera.forward.clone();
    forward.y = 0;
    forward.normalize();
    const right = camera.right.clone();
    right.y = 0;
    right.normalize();
    const move = right.mulScalar(joystickState.x).add(forward.mulScalar(-joystickState.y));
    if (move.lengthSq() > .001) {
      move.normalize();
      const pos = player.getPosition().clone().add(move.mulScalar(dt * 4.2));
      pos.x = pc.math.clamp(pos.x, -38, 38);
      pos.z = pc.math.clamp(pos.z, -38, 38);
      player.setPosition(pos);
      const angle = Math.atan2(move.x, move.z) * pc.math.RAD_TO_DEG;
      player.setEulerAngles(0, angle, 0);
    }
  }
  const target = player.getPosition().clone().add(new pc.Vec3(0, 1.0, 0));
  orbitTarget.lerp(orbitTarget, target, 1 - Math.pow(.001, dt));
  updateCamera();
}

function updateBehaviors(dt) {
  const player = entityViews.get('player');
  if (!player) return;
  const playerPos = player.getPosition();
  for (const descriptor of store.project.entities) {
    if (descriptor.id === 'player') continue;
    const view = entityViews.get(descriptor.id);
    const state = runtime.get(descriptor.id);
    if (!view || !state) continue;

    if (descriptor.behavior === 'spin') {
      view.rotate(0, 90 * dt, 0);
      const p = view.getPosition();
      view.setPosition(p.x, descriptor.position[1] + Math.sin(performance.now() * .004 + state.bob) * .12, p.z);
    }

    if (descriptor.behavior === 'wander' && (descriptor.type === 'npc' || descriptor.type === 'slime')) {
      state.wanderTimer -= dt;
      const pos = view.getPosition();
      if (state.wanderTimer <= 0 || pos.distance(state.wanderTarget) < .3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.random() * 3;
        state.wanderTarget.set(state.origin.x + Math.cos(angle) * radius, 0, state.origin.z + Math.sin(angle) * radius);
        state.wanderTimer = 1.8 + Math.random() * 2.8;
      }
      const direction = state.wanderTarget.clone().sub(pos);
      direction.y = 0;
      if (direction.lengthSq() > .04) {
        direction.normalize();
        view.setPosition(pos.clone().add(direction.mulScalar(dt * (descriptor.type === 'slime' ? 1.1 : 1.35))));
        view.setEulerAngles(0, Math.atan2(direction.x, direction.z) * pc.math.RAD_TO_DEG, 0);
      }
    }

    if (descriptor.behavior === 'follow' && (descriptor.type === 'npc' || descriptor.type === 'slime')) {
      const pos = view.getPosition();
      const direction = playerPos.clone().sub(pos);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 2.2) {
        direction.normalize();
        view.setPosition(pos.clone().add(direction.mulScalar(dt * 1.7)));
        view.setEulerAngles(0, Math.atan2(direction.x, direction.z) * pc.math.RAD_TO_DEG, 0);
      }
    }
  }
}

function updateInteractions() {
  if (!playMode) return;
  const player = entityViews.get('player');
  if (!player) return;
  const playerPos = player.getPosition();
  let nearby = null;
  let nearest = 2.25;
  for (const descriptor of store.project.entities) {
    if (!descriptor.interaction) continue;
    const view = entityViews.get(descriptor.id);
    if (!view || !view.enabled) continue;
    const distance = playerPos.distance(view.getPosition());
    if (distance < nearest) { nearby = { descriptor, view }; nearest = distance; }
  }
  if (!nearby) { lastInteractionKey = ''; return; }
  const { descriptor, view } = nearby;
  const key = `${descriptor.id}:${descriptor.interaction.type}`;
  if (key === lastInteractionKey) return;
  lastInteractionKey = key;
  if (descriptor.interaction.type === 'talk') showToast(`${descriptor.name}: ${descriptor.interaction.text}`, 2600);
  if (descriptor.interaction.type === 'collect') {
    view.enabled = false;
    showToast(descriptor.interaction.text || 'Collected!', 1800);
  }
}

function updateHealth(dt) {
  fpsFrames += 1;
  fpsAccumulator += dt;
  healthTimer += dt;
  if (fpsAccumulator >= .7) {
    fps = Math.round(fpsFrames / fpsAccumulator);
    fpsAccumulator = 0;
    fpsFrames = 0;
  }
  if (healthTimer < 1) return;
  healthTimer = 0;
  const objects = store.project.entities.length;
  let level = 'good';
  if (fps < 36 || objects > 180) level = 'warn';
  if (fps < 24 || objects > 350) level = 'bad';
  healthPill.textContent = level === 'good'
    ? `🟢 Game Health: Good · ${objects} objects`
    : level === 'warn'
      ? `🟠 Game Health: Check · ${fps} FPS`
      : `🔴 Game Health: Heavy · ${fps} FPS`;
}

app.on('update', (dt) => {
  if (playMode) {
    updatePlayer(dt);
    updateBehaviors(dt);
    updateInteractions();
  }
  updateHealth(dt);
});

window.Nuitool = Object.freeze({
  version: '0.4.0',
  getProject: () => JSON.parse(store.exportJSON())
});

window.addEventListener('resize', () => app.resizeCanvas());
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
showToast('Nuitool v0.4 • Add ของ แล้วลากไปวางได้เลย', 2500);
