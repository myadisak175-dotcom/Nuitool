import * as pc from 'playcanvas';

let snapshot = null;
let restoring = false;

function getApp() {
  return pc.Application.getApplication?.() || null;
}

function walk(entity, visit) {
  visit(entity);
  for (const child of entity.children || []) walk(child, visit);
}

function collectRuntimeEntities() {
  const app = getApp();
  const found = new Map();
  if (!app?.root) return found;
  walk(app.root, (entity) => {
    if (entity.nuitoolId) found.set(entity.nuitoolId, entity);
  });
  return found;
}

function vec3(value) {
  return [Number(value.x.toFixed(4)), Number(value.y.toFixed(4)), Number(value.z.toFixed(4))];
}

function captureRuntime() {
  if (!window.Nuitool?.isPlayMode?.()) return null;
  const entities = collectRuntimeEntities();
  const state = {};
  for (const [id, entity] of entities) {
    state[id] = {
      position: vec3(entity.getPosition()),
      rotation: vec3(entity.getEulerAngles()),
      scale: vec3(entity.getLocalScale()),
      enabled: entity.enabled !== false
    };
  }
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    project: window.Nuitool?.getProject?.()?.meta?.name || 'Untitled Game',
    entities: state
  };
}

function restoreRuntime(state) {
  if (!state?.entities) return false;
  const entities = collectRuntimeEntities();
  for (const [id, saved] of Object.entries(state.entities)) {
    const entity = entities.get(id);
    if (!entity) continue;
    entity.enabled = saved.enabled !== false;
    if (Array.isArray(saved.position)) entity.setPosition(saved.position[0], saved.position[1], saved.position[2]);
    if (Array.isArray(saved.rotation)) entity.setEulerAngles(saved.rotation[0], saved.rotation[1], saved.rotation[2]);
    if (Array.isArray(saved.scale)) entity.setLocalScale(saved.scale[0], saved.scale[1], saved.scale[2]);
  }
  return true;
}

function setStatus(message, kind = '') {
  const status = document.querySelector('[data-snapshot-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'saved';
  }
}

function createTools() {
  if (document.querySelector('[data-runtime-snapshot-tools]')) return;
  const tools = document.createElement('div');
  tools.className = 'runtime-snapshot-tools hidden';
  tools.dataset.runtimeSnapshotTools = 'true';
  tools.innerHTML = `
    <div class="snapshot-buttons">
      <button data-take-snapshot>📸 Snapshot</button>
      <button data-retry-snapshot disabled>↩ Retry</button>
    </div>
    <div class="snapshot-status" data-snapshot-status>Save a test point</div>`;
  document.body.appendChild(tools);

  tools.querySelector('[data-take-snapshot]')?.addEventListener('click', () => {
    snapshot = captureRuntime();
    const retry = tools.querySelector('[data-retry-snapshot]');
    if (!snapshot) {
      setStatus('Snapshot failed', 'bad');
      return;
    }
    retry.disabled = false;
    setStatus(`Saved ${formatTime(snapshot.capturedAt)}`, 'good');
    window.dispatchEvent(new CustomEvent('nuitool:playtest-event', { detail: { type: 'snapshot', message: 'Runtime snapshot saved' } }));
  });

  tools.querySelector('[data-retry-snapshot]')?.addEventListener('click', () => retrySnapshot());
}

function retrySnapshot() {
  if (!snapshot || restoring) return;
  restoring = true;
  setStatus('Restoring…');
  window.dispatchEvent(new CustomEvent('nuitool:playtest-event', { detail: { type: 'snapshot', message: 'Retry from runtime snapshot' } }));

  const editButton = document.querySelector('#edit-mode-btn');
  const playButton = document.querySelector('#play-btn');
  if (!editButton || !playButton) {
    restoring = false;
    setStatus('Retry unavailable', 'bad');
    return;
  }

  if (window.Nuitool?.isPlayMode?.()) editButton.click();

  setTimeout(() => {
    playButton.click();
    setTimeout(() => {
      const ok = restoreRuntime(snapshot);
      restoring = false;
      setStatus(ok ? 'Restored ✓' : 'Restore failed', ok ? 'good' : 'bad');
    }, 120);
  }, 80);
}

function showTools() {
  const tools = document.querySelector('[data-runtime-snapshot-tools]');
  if (!tools) return;
  tools.classList.remove('hidden');
  snapshot = null;
  tools.querySelector('[data-retry-snapshot]')?.setAttribute('disabled', '');
  setStatus('Save a test point');
}

function hideTools() {
  document.querySelector('[data-runtime-snapshot-tools]')?.classList.add('hidden');
}

createTools();
document.querySelector('#play-btn')?.addEventListener('click', () => {
  if (!restoring) setTimeout(showTools, 0);
});
document.querySelector('#edit-mode-btn')?.addEventListener('click', () => {
  if (!restoring) setTimeout(hideTools, 0);
});

window.NuitoolSnapshot = Object.freeze({
  capture: () => {
    snapshot = captureRuntime();
    return snapshot;
  },
  retry: retrySnapshot,
  get: () => snapshot ? JSON.parse(JSON.stringify(snapshot)) : null
});
