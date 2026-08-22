const HISTORY_KEY = 'nuitool.playtest.history.v1';
const MAX_HISTORY = 5;

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {}
}

const state = {
  playing: false,
  sessionStartedAt: 0,
  sessionStartedISO: '',
  lastSessionMs: 0,
  frameMs: 16.7,
  fps: 60,
  fpsMin: 120,
  fpsSum: 0,
  fpsSamples: 0,
  longFrames: 0,
  events: [],
  sessionEvents: [],
  history: loadHistory(),
  lastFrameAt: performance.now(),
  lastLoggedToast: '',
  lastLongFrameLogAt: 0,
  retryingUntil: 0
};

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addEvent(type, message) {
  const event = {
    at: new Date().toISOString(),
    label: nowLabel(),
    type: String(type || 'game').slice(0, 30),
    message: String(message || '').slice(0, 180)
  };
  state.events.unshift(event);
  if (state.events.length > 80) state.events.length = 80;
  if (state.playing) {
    state.sessionEvents.push(event);
    if (state.sessionEvents.length > 80) state.sessionEvents.shift();
  }
  refreshMonitor();
}

function startSession() {
  if (state.playing) return;
  state.playing = true;
  state.sessionStartedAt = performance.now();
  state.sessionStartedISO = new Date().toISOString();
  state.longFrames = 0;
  state.fpsMin = 120;
  state.fpsSum = 0;
  state.fpsSamples = 0;
  state.sessionEvents = [];
  state.lastLoggedToast = '';
  addEvent('play', 'Playtest started');
}

function persistSession() {
  const durationMs = state.lastSessionMs;
  if (!durationMs) return;
  const project = window.Nuitool?.getProject?.();
  const averageFps = state.fpsSamples ? Math.round(state.fpsSum / state.fpsSamples) : state.fps;
  const summary = {
    id: `session-${Date.now()}`,
    project: project?.meta?.name || 'Untitled Game',
    startedAt: state.sessionStartedISO,
    endedAt: new Date().toISOString(),
    durationMs: Math.round(durationMs),
    averageFps,
    minFps: state.fpsMin === 120 ? state.fps : state.fpsMin,
    slowFrames: state.longFrames,
    eventCount: state.sessionEvents.length,
    events: state.sessionEvents.slice(-20)
  };
  state.history.unshift(summary);
  state.history = state.history.slice(0, MAX_HISTORY);
  saveHistory(state.history);
}

function stopSession() {
  if (!state.playing) return;
  if (performance.now() < state.retryingUntil) return;
  state.lastSessionMs = Math.max(0, performance.now() - state.sessionStartedAt);
  addEvent('edit', `Playtest ended after ${formatDuration(state.lastSessionMs)}`);
  persistSession();
  state.playing = false;
  refreshMonitor();
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function frameLoop(now) {
  const delta = Math.max(1, now - state.lastFrameAt);
  state.lastFrameAt = now;
  state.frameMs = state.frameMs * 0.9 + delta * 0.1;
  state.fps = Math.max(1, Math.min(120, Math.round(1000 / state.frameMs)));

  if (state.playing) {
    state.fpsMin = Math.min(state.fpsMin, state.fps);
    state.fpsSum += state.fps;
    state.fpsSamples += 1;
    if (delta > 50) {
      state.longFrames += 1;
      if (now - state.lastLongFrameLogAt > 1800) {
        state.lastLongFrameLogAt = now;
        addEvent('performance', `Frame hitch ${Math.round(delta)} ms`);
      }
    }
  }

  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

const playButton = document.querySelector('#play-btn');
const editButton = document.querySelector('#edit-mode-btn');
playButton?.addEventListener('click', () => setTimeout(startSession, 0));
editButton?.addEventListener('click', () => setTimeout(stopSession, 0));

window.addEventListener('nuitool:playtest-event', (event) => {
  const detail = event.detail || {};
  const type = detail.type || 'system';
  const message = detail.message || 'Playtest event';
  if (type === 'snapshot' && /retry/i.test(message)) state.retryingUntil = performance.now() + 1200;
  addEvent(type, message);
});

const toast = document.querySelector('#toast');
if (toast) {
  const observer = new MutationObserver(() => {
    if (!state.playing || toast.classList.contains('hidden')) return;
    const text = toast.textContent?.trim();
    if (!text || text === state.lastLoggedToast) return;
    state.lastLoggedToast = text;
    addEvent('game', text);
  });
  observer.observe(toast, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function performanceLabel() {
  if (state.fps >= 50 && state.longFrames <= 2) return ['🟢', 'Smooth', 'Playtest is running comfortably.'];
  if (state.fps >= 35 && state.longFrames <= 8) return ['🟠', 'Watch', 'Some frames are slower than ideal on this device.'];
  return ['🔴', 'Needs attention', 'This playtest is struggling on the current device.'];
}

function adviceText() {
  const project = window.Nuitool?.getProject?.();
  const objects = project?.entities?.length || 0;
  const rules = project?.rules?.length || 0;
  if (state.fps < 35) return 'ฉากนี้เริ่มหนักบนเครื่องที่กำลังทดสอบ ลองลด Object/เอฟเฟกต์ก่อนเพิ่มระบบใหม่';
  if (state.longFrames > 8) return 'มีช่วงเฟรมสะดุดหลายครั้ง แม้ FPS เฉลี่ยยังดูโอเค ควรตรวจของที่เพิ่งเพิ่มหรือเหตุการณ์ที่เกิดพร้อมกัน';
  if (objects > 180) return `มี ${objects} objects แล้ว ควรเริ่มทดสอบบนมือถือระดับกลางด้วย ไม่ใช่ดูเฉพาะเครื่องแรง`;
  if (rules > 80) return `มี ${rules} rules แล้ว แนะนำแยก logic เป็นกลุ่ม/ระบบก่อนที่การแก้จะเริ่มสับสน`;
  if (state.history.length && state.history[0].slowFrames > 8) return 'Playtest ล่าสุดมีช่วงสะดุดหลายครั้ง ลองทำซ้ำจาก Snapshot เดิมเพื่อดูว่าเกิดซ้ำที่จุดเดิมหรือไม่';
  return 'ตอนนี้ยังดูสบายสำหรับ prototype ลอง Play ให้ครบ flow แล้วดู timeline ว่ามีเหตุการณ์ที่ไม่คาดคิดไหม';
}

function timelineHTML() {
  const rows = state.events.slice(0, 10);
  if (!rows.length) return '<div class="playtest-empty">ยังไม่มี Playtest event</div>';
  return rows.map((event) => `
    <div class="playtest-event">
      <time>${event.label}</time>
      <span class="playtest-event-type">${escapeHtml(event.type)}</span>
      <strong>${escapeHtml(event.message)}</strong>
    </div>`).join('');
}

function historyHTML() {
  if (!state.history.length) return '<div class="playtest-empty">Playtest ที่จบแล้วจะมาอยู่ตรงนี้</div>';
  return state.history.map((session, index) => `
    <div class="history-row">
      <div><strong>#${state.history.length - index} · ${escapeHtml(session.project)}</strong><small>${formatDuration(session.durationMs)} · ${session.eventCount} events</small></div>
      <div class="history-metrics"><span>${session.averageFps} FPS avg</span><span>${session.slowFrames} hitches</span></div>
    </div>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function injectMonitor(overlay) {
  if (!overlay || overlay.querySelector('[data-playtest-monitor]')) return;
  const block = document.createElement('div');
  block.dataset.playtestMonitor = 'true';
  block.innerHTML = `
    <div class="section-title">Playtest Monitor</div>
    <div class="playtest-score" data-playtest-score></div>
    <div class="playtest-metrics">
      <div><small>Live FPS</small><strong data-playtest-fps>—</strong></div>
      <div><small>Frame time</small><strong data-playtest-frame>—</strong></div>
      <div><small>Slow frames</small><strong data-playtest-hitches>0</strong></div>
      <div><small>Session</small><strong data-playtest-session>—</strong></div>
    </div>
    <div class="section-title monitor-section-head"><span>What happened</span><button data-clear-events>Clear</button></div>
    <div class="playtest-timeline" data-playtest-timeline></div>
    <div class="section-title">Recent playtests</div>
    <div class="playtest-history" data-playtest-history></div>
    <div class="section-title">Nuitool advice</div>
    <div class="logic-card" data-playtest-advice></div>
    <div class="monitor-action-row"><button class="wide-btn" data-export-playtest>⇩ Export log</button><button class="wide-btn" data-clear-history>Clear history</button></div>`;

  const exportAnchor = overlay.querySelector('[data-monitor-export]');
  if (exportAnchor) exportAnchor.before(block);
  else overlay.appendChild(block);

  block.querySelector('[data-export-playtest]')?.addEventListener('click', exportPlaytest);
  block.querySelector('[data-clear-events]')?.addEventListener('click', () => {
    state.events = [];
    refreshMonitor();
  });
  block.querySelector('[data-clear-history]')?.addEventListener('click', () => {
    state.history = [];
    saveHistory([]);
    refreshMonitor();
  });
  refreshMonitor();
}

function refreshMonitor() {
  const overlay = document.querySelector('#monitor-overlay');
  if (!overlay) return;
  injectMonitor(overlay);
  const [icon, label, detail] = performanceLabel();
  const score = overlay.querySelector('[data-playtest-score]');
  if (score) score.innerHTML = `<span>${icon}</span><div><strong>${label}</strong><small>${detail}</small></div>`;
  const sessionMs = state.playing ? performance.now() - state.sessionStartedAt : state.lastSessionMs;
  const values = {
    '[data-playtest-fps]': `${state.fps}`,
    '[data-playtest-frame]': `${state.frameMs.toFixed(1)} ms`,
    '[data-playtest-hitches]': `${state.longFrames}`,
    '[data-playtest-session]': sessionMs ? formatDuration(sessionMs) : '—'
  };
  for (const [selector, value] of Object.entries(values)) {
    const el = overlay.querySelector(selector);
    if (el) el.textContent = value;
  }
  const timeline = overlay.querySelector('[data-playtest-timeline]');
  if (timeline) timeline.innerHTML = timelineHTML();
  const history = overlay.querySelector('[data-playtest-history]');
  if (history) history.innerHTML = historyHTML();
  const advice = overlay.querySelector('[data-playtest-advice]');
  if (advice) advice.textContent = adviceText();
}

function exportPlaytest() {
  const project = window.Nuitool?.getProject?.();
  const payload = {
    generatedAt: new Date().toISOString(),
    project: project?.meta?.name || 'Untitled Game',
    device: {
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      userAgent: navigator.userAgent
    },
    metrics: {
      fps: state.fps,
      frameMs: Number(state.frameMs.toFixed(2)),
      slowFrames: state.longFrames,
      lastSessionMs: Math.round(state.playing ? performance.now() - state.sessionStartedAt : state.lastSessionMs)
    },
    events: state.events,
    history: state.history
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nuitool-playtest.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const bodyObserver = new MutationObserver(() => {
  const overlay = document.querySelector('#monitor-overlay');
  if (overlay) injectMonitor(overlay);
});
bodyObserver.observe(document.body, { childList: true });

setInterval(refreshMonitor, 700);
