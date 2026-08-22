import { listImportedModels } from './imported-assets.js';
import { analyzeProjectHealth } from './project-health.js';

let lastReport = null;
let refreshing = false;
let lastRefreshAt = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function issueMarkup(report) {
  if (!report.issues.length) {
    return '<div class="project-doctor-empty">✓ ยังไม่พบปัญหาโครงสร้างที่ต้องแก้ตอนนี้</div>';
  }
  return report.issues.slice(0, 7).map((issue) => `
    <div class="project-doctor-issue ${issue.level}">
      <span>${issue.level === 'bad' ? '!' : '•'}</span>
      <div><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.detail)}</small></div>
    </div>`).join('');
}

function renderInto(block, report) {
  if (!block || !report) return;
  const m = report.metrics;
  block.innerHTML = `
    <div class="section-title">Project Doctor</div>
    <div class="project-doctor-hero ${report.status}">
      <span>${report.icon}</span>
      <div><strong>${escapeHtml(report.label)}</strong><small>${report.issues.length ? `${report.issues.length} item${report.issues.length === 1 ? '' : 's'} to review` : 'Project structure looks healthy'}</small></div>
      <button data-project-doctor-refresh>↻</button>
    </div>
    <div class="project-doctor-metrics">
      <div><small>Objects</small><strong>${m.objects}</strong></div>
      <div><small>Rules</small><strong>${m.rules}</strong></div>
      <div><small>Active NPC</small><strong>${m.activeCharacters}</strong></div>
      <div><small>My 3D</small><strong>${m.importedPlaced}</strong></div>
      <div><small>Missing</small><strong>${m.missingImported}</strong></div>
      <div><small>Local set</small><strong>${formatBytes(m.usedLocalBytes)}</strong></div>
    </div>
    <div class="project-doctor-issues">${issueMarkup(report)}</div>`;
  block.querySelector('[data-project-doctor-refresh]')?.addEventListener('click', () => refreshDoctor(true));
}

function injectDoctor(overlay) {
  if (!overlay) return null;
  let block = overlay.querySelector('[data-project-doctor]');
  if (block) return block;
  block = document.createElement('div');
  block.dataset.projectDoctor = 'true';
  const playtest = overlay.querySelector('[data-playtest-monitor]');
  const exportButton = overlay.querySelector('[data-monitor-export]');
  if (playtest) playtest.before(block);
  else if (exportButton) exportButton.before(block);
  else overlay.appendChild(block);
  if (lastReport) renderInto(block, lastReport);
  return block;
}

async function refreshDoctor(force = false) {
  const now = performance.now();
  if (refreshing || (!force && now - lastRefreshAt < 1200)) return;
  refreshing = true;
  try {
    const project = window.Nuitool?.getProject?.();
    if (!project) return;
    const models = await listImportedModels();
    lastReport = analyzeProjectHealth(project, models);
    lastRefreshAt = performance.now();
    const overlay = document.querySelector('#monitor-overlay');
    if (overlay) renderInto(injectDoctor(overlay), lastReport);
    window.dispatchEvent(new CustomEvent('nuitool:project-health', { detail: lastReport }));
  } finally {
    refreshing = false;
  }
}

const bodyObserver = new MutationObserver(() => {
  const overlay = document.querySelector('#monitor-overlay');
  if (!overlay) return;
  injectDoctor(overlay);
  refreshDoctor();
});
bodyObserver.observe(document.body, { childList: true, subtree: false });

window.addEventListener('nuitool:asset-library-change', () => refreshDoctor(true));
window.addEventListener('nuitool:asset-loaded', () => refreshDoctor(true));
window.addEventListener('nuitool:asset-load-error', () => refreshDoctor(true));
setInterval(() => {
  if (document.querySelector('#monitor-overlay')) refreshDoctor();
}, 1400);
