import * as pc from 'playcanvas';
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
app.root.addChild(selectionMarker);

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
  day: {
    clear: new pc.Color(0.64, 0.82, 0.96),
    ambient: new pc.Color(0.65, 0.7, 0.75),
    sun: new pc.Color(1, 0.95, 0.84),
    intensity: 1.25
  },
  sunset: {
    clear: new pc.Color(0.92, 0.59, 0.53),
    ambient: new pc.Color(0.62, 0.48, 0.55),
    sun: new pc.Color(1, 0.68, 0.46),
    intensity: 1.1
  },
  night: {
    clear: new pc.Color(0.06, 0.09, 0.18),
    ambient: new pc.Color(0.18, 0.22, 0.36),
    sun: new pc.Color(0.48, 0.58, 0.9),
    intensity: 0.45
  }
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

function iconFor(type) {
  if (type === 'player') return '🎮';
  return ASSET_CATALOG.find((asset) => asset.type === type)?.icon || '◆';
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
  const grounds = [
    ['meadow', '🌱', 'Meadow'], ['dirt', '🟫', 'Dirt'], ['sand', '🏖️', 'Sand'], ['stone', '🪨', 'Stone']
  ];
  const skyOptions = [
    ['day', '☀️', 'Day'], ['sunset', '🌇', 'Sunset'], ['night', '🌙', 'Night']
  ];
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

function renderAddPanel() {
  panel.innerHTML = `${panelHeader('Add', 'เลือกของ แล้วแตะพื้นเพื่อวาง')}
    <div class="asset-grid">${ASSET_CATALOG.map((asset) => `<button class="asset-card" data-asset="${asset.type}"><span>${asset.icon}</span><strong>${asset.name}</strong><small>${asset.category}</small></button>`).join('')}</div>`;
  bindClose();
  panel.querySelectorAll('[data-asset]').forEach((button) => button.addEventListener('click', () => {
    const asset = ASSET_CATALOG.find((item) => item.type === button.dataset.asset);
    activePlacement = asset;
    placementHint.textContent = `${asset.icon} แตะพื้นเพื่อวาง ${asset.name} • แตะ Add อีกครั้งเพื่อยกเลิก`;
    placementHint.classList.remove('hidden');
    closePanel();
    showToast(`พร้อมวาง ${asset.name}`);
  }));
}

function renderLogicPanel() {
  const entity = selectedId ? store.getEntity(selectedId) : null;
  if (!entity || entity.id === 'player') {
    panel.innerHTML = `${panelHeader('Logic', 'เลือก Object หรือ Character ในโลกก่อน')}
      <div class="logic-card"><div class="logic-line"><div class="logic-key">WHEN</div><div class="logic-value">Player approaches Mia</div></div><div class="logic-line"><div class="logic-key">DO</div><div class="logic-value">Talk</div></div></div>
      <p style="opacity:.58;font-size:12px;line-height:1.55;margin:12px 2px 0">ใน v0.1 Logic ถูกแปลงเป็น Behavior ที่เข้าใจง่ายก่อน ระบบ WHEN → IF → DO เต็มรูปแบบจะต่อยอดจาก Project Schema เดียวกัน</p>`;
    bindClose();
    return;
  }

  const character = entity.type === 'npc' || entity.type === 'slime';
  const talk = entity.interaction?.type === 'talk';
  panel.innerHTML = `${panelHeader(`${iconFor(entity.type)} ${entity.name}`, 'แตะเลือกสิ่งที่อยากให้มันทำ')}
    <div class="section-title">Edit object</div>
    <div class="toolbar-row">
      <button data-move="left">←</button><button data-move="up">↑</button><button data-move="down">↓</button><button data-move="right">→</button>
    </div>
    <div class="property-row"><div><label>Rotation</label><small>หมุนวัตถุทีละ 15°</small></div><div class="segmented"><button data-rotate="-15">−</button><button data-rotate="15">＋</button></div></div>
    <div class="property-row"><div><label>Size</label><small>ปรับขนาดแบบง่าย</small></div><div class="segmented"><button data-scale="0.9">−</button><button data-scale="1.1">＋</button></div></div>
    ${character ? `<div class="section-title">Movement</div><div class="choice-grid"><button class="choice ${entity.behavior === 'stay' ? 'active' : ''}" data-behavior="stay"><span>📍</span><strong>Stay</strong></button><button class="choice ${entity.behavior === 'wander' ? 'active' : ''}" data-behavior="wander"><span>🚶</span><strong>Walk around</strong></button><button class="choice ${entity.behavior === 'follow' ? 'active' : ''}" data-behavior="follow"><span>🧲</span><strong>Follow</strong></button></div>` : ''}
    ${entity.type === 'npc' ? `<div class="section-title">Interaction</div><div class="property-row"><div><label>Talk when near</label><small>${talk ? entity.interaction.text : 'ปิดอยู่'}</small></div><div class="segmented"><button data-talk="off" class="${!talk ? 'active' : ''}">Off</button><button data-talk="on" class="${talk ? 'active' : ''}">On</button></div></div>` : ''}
    <div class="section-title">Manage</div><div class="toolbar-row"><button data-duplicate>Copy</button><button data-delete class="danger">Delete</button></div>`;
  bindClose();

  const move = (dx, dz) => store.updateEntity(entity.id, { position: [entity.position[0] + dx, entity.position[1], entity.position[2] + dz] });
  panel.querySelector('[data-move="left"]')?.addEventListener('click', () => move(-.5, 0));
  panel.querySelector('[data-move="right"]')?.addEventListener('click', () => move(.5, 0));
  panel.querySelector('[data-move="up"]')?.addEventListener('click', () => move(0, -.5));
  panel.querySelector('[data-move="down"]')?.addEventListener('click', () => move(0, .5));
  panel.querySelectorAll('[data-rotate]').forEach((button) => button.addEventListener('click', () => store.updateEntity(entity.id, { rotationY: (entity.rotationY || 0) + Number(button.dataset.rotate) })));
  panel.querySelectorAll('[data-scale]').forEach((button) => button.addEventListener('click', () => store.updateEntity(entity.id, { scale: Math.min(3, Math.max(.3, (entity.scale || 1) * Number(button.dataset.scale))) })));
  panel.querySelectorAll('[data-behavior]').forEach((button) => button.addEventListener('click', () => store.updateEntity(entity.id, { behavior: button.dataset.behavior })));
  panel.querySelector('[data-talk="on"]')?.addEventListener('click', () => store.updateEntity(entity.id, { interaction: { type: 'talk', text: entity.interaction?.text || 'สวัสดี!' } }));
  panel.querySelector('[data-talk="off"]')?.addEventListener('click', () => store.updateEntity(entity.id, { interaction: null }));
  panel.querySelector('[data-duplicate]')?.addEventListener('click', () => {
    const copy = store.duplicateEntity(entity.id); if (copy) { selectedId = copy.id; renderLogicPanel(); }
  });
  panel.querySelector('[data-delete]')?.addEventListener('click', () => {
    if (store.removeEntity(entity.id)) { selectedId = null; closePanel(); selectionPill.classList.add('hidden'); }
  });
}

for (const button of bottomNav.querySelectorAll('[data-panel]')) {
  button.addEventListener('click', () => {
    if (button.dataset.panel === 'add' && activePlacement) {
      activePlacement = null;
      placementHint.classList.add('hidden');
      showToast('ยกเลิกการวาง');
      return;
    }
    openPanel(button.dataset.panel);
  });
}

function showProjectMenu() {
  if (playMode) return;
  activePanel = 'menu';
  panel.classList.remove('hidden');
  panel.innerHTML = `${panelHeader('Project', 'My First Game')}
    <div class="menu-sheet">
      <button data-export>⇩ Export project JSON</button>
      <button data-reset>↺ Reset starter world</button>
      <button data-about>ⓘ About Nuitool v0.1</button>
    </div>`;
  bindClose();
  panel.querySelector('[data-export]')?.addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'nuitool-project.json'; a.click(); URL.revokeObjectURL(url);
  });
  panel.querySelector('[data-reset]')?.addEventListener('click', () => { if (confirm('Reset project?')) store.reset(); });
  panel.querySelector('[data-about]')?.addEventListener('click', () => showToast('Nuitool — touch-first game creator. Easy first. Powerful later.', 3000));
}

document.querySelector('#menu-btn').addEventListener('click', showProjectMenu);
document.querySelector('#undo-btn').addEventListener('click', () => { if (!store.undo()) showToast('ไม่มีอะไรให้ย้อนกลับ'); });
document.querySelector('#redo-btn').addEventListener('click', () => { if (!store.redo()) showToast('ไม่มีอะไรให้ทำซ้ำ'); });

let pointerStart = null;
let orbiting = false;
let moved = false;
let pinchStart = 0;

function screenToGround(x, y) {
  const from = camera.camera.screenToWorld(x, y, camera.camera.nearClip);
  const to = camera.camera.screenToWorld(x, y, camera.camera.farClip);
  const direction = to.clone().sub(from);
  if (Math.abs(direction.y) < 0.0001) return null;
  const t = -from.y / direction.y;
  if (t < 0) return null;
  return from.clone().add(direction.mulScalar(t));
}

function findSelectableAt(x, y) {
  const groundPoint = screenToGround(x, y);
  if (!groundPoint) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const descriptor of store.project.entities) {
    if (descriptor.id === 'player') continue;
    const dx = descriptor.position[0] - groundPoint.x;
    const dz = descriptor.position[2] - groundPoint.z;
    const distance = Math.hypot(dx, dz);
    const radius = Math.max(.75, 1.2 * (descriptor.scale || 1));
    if (distance < radius && distance < bestDistance) { best = descriptor; bestDistance = distance; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (event) => {
  if (playMode) return;
  pointerStart = { x: event.clientX, y: event.clientY, yaw: orbitYaw, pitch: orbitPitch };
  orbiting = true; moved = false;
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (playMode || !orbiting || !pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) > 6) moved = true;
  if (!activePlacement && moved) {
    orbitYaw = pointerStart.yaw - dx * .25;
    orbitPitch = Math.max(18, Math.min(72, pointerStart.pitch - dy * .18));
    updateCamera();
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (playMode) return;
  orbiting = false;
  if (!moved) {
    if (activePlacement) {
      const p = screenToGround(event.clientX, event.clientY);
      if (p) {
        const created = store.addEntity(activePlacement.type, activePlacement.name, [Number(p.x.toFixed(2)), 0, Number(p.z.toFixed(2))]);
        selectedId = created.id;
        updateSelectionMarker();
        showToast(`${activePlacement.icon} วาง ${activePlacement.name} แล้ว`);
      }
    } else {
      const picked = findSelectableAt(event.clientX, event.clientY);
      if (picked) { selectedId = picked.id; updateSelectionMarker(); renderLogicPanel(); activePanel = 'logic'; panel.classList.remove('hidden'); }
      else { selectedId = null; updateSelectionMarker(); selectionPill.classList.add('hidden'); }
    }
  }
  pointerStart = null;
});

canvas.addEventListener('wheel', (event) => {
  if (playMode) return;
  orbitDistance = Math.max(7, Math.min(34, orbitDistance + Math.sign(event.deltaY) * 1.2));
  updateCamera();
}, { passive: true });

canvas.addEventListener('touchstart', (event) => {
  if (playMode || event.touches.length !== 2) return;
  const [a, b] = event.touches;
  pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}, { passive: true });
canvas.addEventListener('touchmove', (event) => {
  if (playMode || event.touches.length !== 2 || !pinchStart) return;
  const [a, b] = event.touches;
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  orbitDistance = Math.max(7, Math.min(34, orbitDistance * (pinchStart / distance)));
  pinchStart = distance;
  updateCamera();
}, { passive: true });
canvas.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

function enterPlayMode() {
  playMode = true;
  closePanel();
  activePlacement = null;
  selectionMarker.enabled = false;
  selectionPill.classList.add('hidden');
  placementHint.classList.add('hidden');
  bottomNav.classList.add('hidden');
  document.querySelector('.topbar').classList.add('hidden');
  healthPill.classList.add('hidden');
  editModeBtn.classList.remove('hidden');
  joystick.classList.remove('hidden');
  modeLabel.textContent = 'Play mode';
  showToast('Play mode — เดินเข้าใกล้ Mia เพื่อคุย');
}

function exitPlayMode() {
  playMode = false;
  bottomNav.classList.remove('hidden');
  document.querySelector('.topbar').classList.remove('hidden');
  healthPill.classList.remove('hidden');
  editModeBtn.classList.add('hidden');
  joystick.classList.add('hidden');
  modeLabel.textContent = 'Edit mode';
  joystickKnob.style.transform = 'translate(0, 0)';
  joystickVector.set(0, 0);
  syncScene();
  showToast('กลับสู่ Edit mode');
}
playBtn.addEventListener('click', enterPlayMode);
editModeBtn.addEventListener('click', exitPlayMode);

const joystickVector = new pc.Vec2();
let joystickPointer = null;
function updateJoystick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = clientX - cx, dy = clientY - cy;
  const max = rect.width * .31;
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = dx / length * max; dy = dy / length * max; }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joystickVector.set(dx / max, dy / max);
}
joystick.addEventListener('pointerdown', (event) => { joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event.clientX, event.clientY); });
joystick.addEventListener('pointermove', (event) => { if (joystickPointer === event.pointerId) updateJoystick(event.clientX, event.clientY); });
joystick.addEventListener('pointerup', (event) => { if (joystickPointer === event.pointerId) { joystickPointer = null; joystickVector.set(0, 0); joystickKnob.style.transform = 'translate(0,0)'; } });

function moveToward(entity, target, speed, dt) {
  const p = entity.getPosition();
  const direction = target.clone().sub(p); direction.y = 0;
  const distance = direction.length();
  if (distance < .03) return distance;
  direction.normalize();
  const step = Math.min(distance, speed * dt);
  entity.translate(direction.x * step, 0, direction.z * step);
  const yaw = Math.atan2(direction.x, direction.z) * pc.math.RAD_TO_DEG;
  entity.setEulerAngles(0, yaw, 0);
  return distance;
}

function updateRuntime(dt) {
  const player = entityViews.get('player');
  if (!player) return;

  if (playMode) {
    const yaw = orbitYaw * pc.math.DEG_TO_RAD;
    const forward = new pc.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new pc.Vec3(Math.cos(yaw), 0, -Math.sin(yaw));
    const velocity = forward.mulScalar(-joystickVector.y).add(right.mulScalar(joystickVector.x));
    if (velocity.lengthSq() > .01) {
      velocity.normalize();
      player.translate(velocity.x * 3.2 * dt, 0, velocity.z * 3.2 * dt);
      player.setEulerAngles(0, Math.atan2(velocity.x, velocity.z) * pc.math.RAD_TO_DEG, 0);
    }
    const pp = player.getPosition();
    orbitTarget.lerp(orbitTarget, new pc.Vec3(pp.x, .9, pp.z), Math.min(1, dt * 6));
    updateCamera();
  }

  const playerPos = player.getPosition();
  for (const descriptor of store.project.entities) {
    const view = entityViews.get(descriptor.id); const state = runtime.get(descriptor.id);
    if (!view || !state || descriptor.id === 'player') continue;

    if (descriptor.behavior === 'spin') view.rotate(0, dt * 80, 0);
    if (descriptor.type === 'slime') {
      state.bob += dt * 3.4;
      const p = view.getPosition();
      view.setPosition(p.x, Math.sin(state.bob) * .05, p.z);
    }
    if (playMode && (descriptor.type === 'npc' || descriptor.type === 'slime')) {
      if (descriptor.behavior === 'wander') {
        state.wanderTimer -= dt;
        if (state.wanderTimer <= 0 || view.getPosition().clone().sub(state.wanderTarget).length() < .25) {
          const angle = Math.random() * Math.PI * 2, radius = 1.2 + Math.random() * 3.4;
          state.wanderTarget.set(state.origin.x + Math.cos(angle) * radius, 0, state.origin.z + Math.sin(angle) * radius);
          state.wanderTimer = 2 + Math.random() * 4;
        }
        moveToward(view, state.wanderTarget, descriptor.type === 'slime' ? .85 : 1.15, dt);
      }
      if (descriptor.behavior === 'follow') {
        const target = playerPos.clone();
        if (view.getPosition().clone().sub(target).length() > 1.7) moveToward(view, target, 1.5, dt);
      }
    }

    if (playMode && descriptor.interaction) {
      const distance = view.getPosition().clone().sub(playerPos).length();
      const key = `${descriptor.id}:${descriptor.interaction.type}`;
      if (distance < 1.8 && lastInteractionKey !== key) {
        lastInteractionKey = key;
        if (descriptor.interaction.type === 'talk') showToast(`${descriptor.name}: ${descriptor.interaction.text}`, 2600);
        if (descriptor.interaction.type === 'collect') {
          showToast(`🪙 ${descriptor.interaction.text}`, 1700);
          view.enabled = false;
        }
      } else if (distance > 2.4 && lastInteractionKey === key) lastInteractionKey = '';
    }
  }
}

function updateHealth(dt) {
  fpsAccumulator += dt; fpsFrames++;
  if (fpsAccumulator >= .55) {
    fps = Math.round(fpsFrames / fpsAccumulator);
    fpsAccumulator = 0; fpsFrames = 0;
  }
  healthTimer += dt;
  if (healthTimer < 1.2 || playMode) return;
  healthTimer = 0;
  const count = store.project.entities.length;
  if (fps < 30 || count > 260) healthPill.textContent = `🔴 Game Health: Heavy • ${fps} FPS`;
  else if (fps < 48 || count > 140) healthPill.textContent = `🟠 Game Health: Watch • ${fps} FPS`;
  else healthPill.textContent = `🟢 Game Health: Good • ${fps} FPS`;
}

app.on('update', (dt) => {
  updateRuntime(Math.min(dt, .05));
  updateHealth(dt);
});

window.addEventListener('resize', () => app.resizeCanvas());
