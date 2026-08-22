const state = {
  playing: false,
  sessionStartedAt: 0,
  lastSessionMs: 0,
  frameMs: 16.7,
  fps: 60,
  longFrames: 0,
  events: [],
  lastFrameAt: performance.now(),
  lastLoggedToast: '',
  lastLongFrameLogAt: 0
};

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addEvent(type, message) {
  state.events.unshift({
    at: new Date().toISOString(),
    label: nowLabel(),
    type,
    message: String(message || '').slice(0, 180)
  });
  if (state.events.length > 80) state.events.length = 80;
  refreshMonitor();
}

function startSession() {
  state.playing = true;
  state.sessionStartedAt = performance.now();
  state.longFrames = 0;
  state.lastLoggedToast = '';
  addEvent('play', 'Playtest started');
}

function stopSession() {
  if (!state.playing) return;
  state.lastSessionMs = Math.max(0, performance.now() - state.sessionStartedAt);
  state.playing = false;
  addEvent('edit', `Playtest ended after ${formatDuration(state.lastSessionMs)}`);
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

  if (state.playing && delta > 50) {
    state.longFrames += 1;
    if (now - state.lastLongFrameLogAt > 1800) {
      state.lastLongFrameLogAt = now;
      addEvent('performance', `Frame hitch ${Math.round(delta)} ms`);
    }
  }

  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

const playButton = document.querySelector('#play-btn');
const editButton = document.querySelector('#edit-mode-btn');
playButton?.addEventListener('click', () => setTimeout(startSession, 0));
editButton?.addEventListener('click', () => setTimeout(stopSession, 0));

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
  return 'ตอนนี้ยังดูสบายสำหรับ prototype ลอง Play ให้ครบ flow แล้วดู timeline ว่ามีเหตุการณ์ที่ไม่คาดคิดไหม';
}

function timelineHTML() {
  const rows = state.events.slice(0, 8);
  if (!rows.length) return '<div class="playtest-empty">ยังไม่มี Playtest event</div>';
  return rows.map((event) => `
    <div class="playtest-event">
      <time>${event.label}</time>
      <span class="playtest-event-type">${event.type}</span>
      <strong>${escapeHtml(event.message)}</strong>
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
    <div class="section-title">What happened</div>
    <div class="playtest-timeline" data-playtest-timeline></div>
    <div class="section-title">Nuitool advice</div>
    <div class="logic-card" data-playtest-advice></div>
    <button class="wide-btn" data-export-playtest>⇩ Export playtest log</button>`;

  const exportAnchor = overlay.querySelector('[data-monitor-export]');
  if (exportAnchor) exportAnchor.before(block);
  else overlay.appendChild(block);

  block.querySelector('[data-export-playtest]')?.addEventListener('click', exportPlaytest);
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
    events: state.events
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
