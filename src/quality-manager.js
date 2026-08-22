import * as pc from 'playcanvas';
import { getGPUTier } from '@pmndrs/detect-gpu';
import { calibrateAutoQuality, fallbackQualityFromSignals, qualityFromGpuResult, resolvePreset } from './quality-profile.js';

const STORAGE_KEY = 'nuitool.quality.mode.v1';
const VALID_MODES = new Set(['auto', 'eco', 'balanced', 'high']);
const panelElement = document.querySelector('#panel');
const state = {
  mode: VALID_MODES.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'auto',
  applied: 'balanced',
  gpu: null,
  calibrationFps: null,
  calibrated: false,
  app: null
};

function signals() {
  return {
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    pixelCount: Math.max(1, window.screen?.width || innerWidth) * Math.max(1, window.screen?.height || innerHeight)
  };
}

function waitForApp(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const app = pc.Application.getApplication?.();
      if (app) return resolve(app);
      if (performance.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 80);
    };
    tick();
  });
}

function qualityForMode() {
  if (state.mode !== 'auto') return state.mode;
  if (state.gpu) return qualityFromGpuResult(state.gpu, signals());
  return fallbackQualityFromSignals(signals());
}

function applyQuality(id, reason = 'settings') {
  const app = state.app;
  if (!app) return;
  const preset = resolvePreset(id);
  const actualDpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
  app.graphicsDevice.maxPixelRatio = actualDpr;
  app.resizeCanvas();

  const sun = app.root.findByName?.('Sun');
  if (sun?.light) {
    sun.light.castShadows = preset.shadows;
    sun.light.shadowResolution = preset.shadowResolution;
    sun.light.shadowDistance = preset.shadowDistance;
  }
  state.applied = preset.id;
  window.dispatchEvent(new CustomEvent('nuitool:quality-change', { detail: { ...getState(), reason } }));
  refreshVisibleUi();
}

async function detectGpu() {
  try {
    const options = {};
    const gl = state.app?.graphicsDevice?.gl;
    if (gl) options.glContext = gl;
    state.gpu = await getGPUTier(options);
  } catch (error) {
    state.gpu = { tier: -1, type: 'DETECTION_FAILED', gpu: '', error: String(error?.message || error) };
  }
  applyQuality(qualityForMode(), 'gpu-detection');
}

function measureFps(durationMs = 2600) {
  return new Promise((resolve) => {
    if (document.visibilityState !== 'visible') return resolve(null);
    let frames = 0;
    let first = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now) => {
      if (!first) first = now;
      last = now;
      frames += 1;
      if (now - start >= durationMs) {
        const seconds = Math.max(.001, (last - first) / 1000);
        resolve(frames > 1 ? (frames - 1) / seconds : null);
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function calibrate() {
  if (state.mode !== 'auto' || state.calibrated) return;
  await new Promise((resolve) => setTimeout(resolve, 1800));
  if (state.mode !== 'auto') return;
  const fps = await measureFps();
  if (!Number.isFinite(fps)) return;
  state.calibrationFps = Math.round(fps);
  state.calibrated = true;
  const before = state.applied;
  const next = calibrateAutoQuality(before, fps);
  if (next !== before) applyQuality(next, 'live-calibration');
  else refreshVisibleUi();
}

export function getState() {
  return {
    mode: state.mode,
    applied: state.applied,
    gpu: state.gpu,
    calibrationFps: state.calibrationFps,
    deviceMemory: navigator.deviceMemory || null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    devicePixelRatio: window.devicePixelRatio || 1,
    appliedPixelRatio: state.app?.graphicsDevice?.maxPixelRatio || null
  };
}

export function setMode(mode) {
  if (!VALID_MODES.has(mode)) return false;
  state.mode = mode;
  localStorage.setItem(STORAGE_KEY, mode);
  state.calibrated = mode !== 'auto';
  state.calibrationFps = null;
  applyQuality(qualityForMode(), 'user');
  if (mode === 'auto') {
    state.calibrated = false;
    calibrate();
  }
  return true;
}

function labelForMode() {
  const applied = resolvePreset(state.applied).label;
  return state.mode === 'auto' ? `Auto · ${applied}` : applied;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function openQualityPanel() {
  document.querySelector('#quality-overlay')?.remove();
  const q = getState();
  const gpuName = q.gpu?.gpu || (q.gpu?.type === 'BENCHMARK_FETCH_FAILED' ? 'Benchmark offline' : 'Automatic fallback');
  const overlay = document.createElement('section');
  overlay.id = 'quality-overlay';
  overlay.className = 'quality-overlay';
  const option = (id, icon, title, text) => `<button class="quality-option ${state.mode === id ? 'active' : ''}" data-quality-mode="${id}"><span>${icon}</span><div><strong>${title}</strong><small>${text}</small></div>${state.mode === id ? '<b>✓</b>' : ''}</button>`;
  overlay.innerHTML = `
    <div class="quality-card">
      <div class="panel-head"><div><h2>Graphics Quality</h2><p>Nuitool เลือกค่าที่เหมาะกับมือถือให้ได้</p></div><button class="close-btn" data-quality-close>×</button></div>
      <div class="quality-device"><span>📱</span><div><strong>${escapeHtml(gpuName)}</strong><small>GPU tier ${q.gpu?.tier ?? '?'} · ${q.hardwareConcurrency || '?'} CPU threads${q.deviceMemory ? ` · ${q.deviceMemory} GB memory signal` : ''}</small></div></div>
      <div class="quality-options">
        ${option('auto', '✨', 'Auto', 'GPU profile + live FPS calibration')}
        ${option('eco', '🌱', 'Eco', 'เบาสุด · 1× resolution · shadows off')}
        ${option('balanced', '⚖️', 'Balanced', 'ค่าเริ่มต้นที่สมดุลสำหรับมือถือ')}
        ${option('high', '💎', 'High', 'ภาพคมและเงาละเอียดขึ้น')}
      </div>
      <div class="quality-note">ตอนนี้ใช้ <strong>${labelForMode()}</strong>${q.calibrationFps ? ` · calibration ${q.calibrationFps} FPS` : ''}. Auto จะลดคุณภาพได้เองถ้า FPS จริงไม่ถึงเป้า แต่จะไม่เพิ่มเกิน GPU/device profile ที่ประเมินไว้</div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-quality-close]')?.addEventListener('click', close);
  overlay.querySelectorAll('[data-quality-mode]').forEach((button) => button.addEventListener('click', () => {
    setMode(button.dataset.qualityMode);
    close();
    openQualityPanel();
  }));
}

function injectMenu() {
  const menu = panelElement?.querySelector('.menu-sheet');
  if (!menu || menu.querySelector('[data-quality-settings]')) return;
  const button = document.createElement('button');
  button.dataset.qualitySettings = 'true';
  button.textContent = `🎛 Graphics: ${labelForMode()}`;
  button.addEventListener('click', openQualityPanel);
  const about = menu.querySelector('[data-about]');
  if (about) about.before(button);
  else menu.appendChild(button);
}

function injectMonitor() {
  const overlay = document.querySelector('#monitor-overlay');
  if (!overlay) return;
  let block = overlay.querySelector('[data-device-profile]');
  if (!block) {
    block = document.createElement('div');
    block.dataset.deviceProfile = 'true';
    const projectDoctor = overlay.querySelector('[data-project-doctor]');
    if (projectDoctor) projectDoctor.before(block);
    else overlay.prepend(block);
  }
  const q = getState();
  block.innerHTML = `
    <div class="section-title">Device Profile</div>
    <div class="quality-monitor-row"><span>📱</span><div><strong>${escapeHtml(labelForMode())}</strong><small>GPU tier ${q.gpu?.tier ?? '?'} · render ${Number(q.appliedPixelRatio || 1).toFixed(1)}×${q.calibrationFps ? ` · calibration ${q.calibrationFps} FPS` : ''}</small></div><button data-quality-monitor-open>Change</button></div>`;
  block.querySelector('[data-quality-monitor-open]')?.addEventListener('click', openQualityPanel);
}

function refreshVisibleUi() {
  const menuButton = panelElement?.querySelector('[data-quality-settings]');
  if (menuButton) menuButton.textContent = `🎛 Graphics: ${labelForMode()}`;
  injectMonitor();
}

if (panelElement) {
  const panelObserver = new MutationObserver(injectMenu);
  panelObserver.observe(panelElement, { childList: true, subtree: true });
}
const bodyObserver = new MutationObserver(injectMonitor);
bodyObserver.observe(document.body, { childList: true });

window.NuitoolQuality = Object.freeze({ getState, setMode });

(async () => {
  state.app = await waitForApp();
  if (!state.app) return;
  applyQuality(qualityForMode(), 'initial');
  await detectGpu();
  if (state.mode === 'auto') calibrate();
})();
