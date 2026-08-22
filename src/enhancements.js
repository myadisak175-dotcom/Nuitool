import { validateProject } from './project.js';
import { GAME_TEMPLATES } from './templates.js';

const STORAGE_KEY = 'nuitool.project.v0.1';
const SNAPSHOT_KEY = 'nuitool.project.snapshot.latest';
const panel = document.querySelector('#panel');
const healthPill = document.querySelector('#health-pill');
let installPrompt = null;

function readProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toast(message, duration = 1800) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), duration);
}

function downloadJSON(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveTemplate(template) {
  const next = template.make();
  const result = validateProject(next);
  if (!result.ok) return toast(`Template error: ${result.error}`, 3000);
  const current = readProject();
  if (current) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), project: current }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result.project));
  toast(`${template.icon} ${template.name} พร้อมแล้ว`);
  setTimeout(() => location.reload(), 420);
}

function openTemplatePicker() {
  document.querySelector('#template-overlay')?.remove();
  const overlay = document.createElement('section');
  overlay.id = 'template-overlay';
  overlay.className = 'template-overlay glass';
  overlay.innerHTML = `
    <div class="panel-head">
      <div><h2>New Game</h2><p>เลือกจุดเริ่มต้น แล้วแก้ทุกอย่างต่อได้</p></div>
      <button class="close-btn" data-template-close>×</button>
    </div>
    <div class="template-grid">
      ${GAME_TEMPLATES.map((template) => `
        <button class="template-card" data-template="${template.id}">
          <span class="template-icon">${template.icon}</span>
          <strong>${template.name}</strong>
          <small>${template.subtitle}</small>
          <div class="template-tags">${template.tags.map((tag) => `<em>${tag}</em>`).join('')}</div>
        </button>
      `).join('')}
    </div>
    <div class="template-note">ก่อนเปลี่ยน Template ระบบจะเก็บ Project ปัจจุบันเป็น Snapshot ให้อัตโนมัติ</div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-template-close]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => {
    const template = GAME_TEMPLATES.find((item) => item.id === button.dataset.template);
    if (template) saveTemplate(template);
  }));
}

async function importProjectFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = validateProject(parsed);
      if (!result.ok) {
        toast(`Import failed: ${result.error}`, 3000);
        return;
      }
      const current = readProject();
      if (current) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), project: current }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.project));
      toast('Imported project ✓');
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(`Import failed: ${error?.message || 'invalid file'}`, 3000);
    }
  }, { once: true });
  input.click();
}

function createSnapshot() {
  const project = readProject();
  if (!project) return toast('No project to snapshot');
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), project }));
  toast('Project Snapshot saved 📸');
}

function restoreSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return toast('No snapshot yet');
    const snapshot = JSON.parse(raw);
    const result = validateProject(snapshot.project);
    if (!result.ok) return toast('Snapshot is invalid');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.project));
    toast('Snapshot restored ↩');
    setTimeout(() => location.reload(), 450);
  } catch {
    toast('Could not restore snapshot');
  }
}

function assetCounts(project) {
  const counts = new Map();
  for (const entity of project?.entities || []) counts.set(entity.type, (counts.get(entity.type) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function openMonitor() {
  const existing = document.querySelector('#monitor-overlay');
  if (existing) return existing.remove();
  const project = readProject();
  const count = project?.entities?.length || 0;
  const deviceMemory = navigator.deviceMemory ? `${navigator.deviceMemory} GB class` : 'Unknown';
  const cores = navigator.hardwareConcurrency || 'Unknown';
  const top = assetCounts(project).slice(0, 5);
  const characters = (project?.entities || []).filter((entity) => entity.type === 'npc' || entity.type === 'slime').length;
  const interactables = (project?.entities || []).filter((entity) => entity.interaction).length;
  const status = count < 120 ? ['🟢', 'Healthy', 'Scene size is comfortable for this prototype.']
    : count < 240 ? ['🟠', 'Watch', 'Consider repeating assets efficiently and reducing heavy effects.']
      : ['🔴', 'Heavy', 'This scene is getting large for a mobile-first target.'];

  const overlay = document.createElement('section');
  overlay.id = 'monitor-overlay';
  overlay.className = 'monitor-overlay glass';
  overlay.innerHTML = `
    <div class="panel-head">
      <div><h2>Game Monitor</h2><p>Human-readable project health</p></div>
      <button class="close-btn" data-monitor-close>×</button>
    </div>
    <div class="monitor-score"><span>${status[0]}</span><div><strong>${status[1]}</strong><small>${status[2]}</small></div></div>
    <div class="monitor-grid">
      <div><small>Objects</small><strong>${count}</strong></div>
      <div><small>Characters</small><strong>${characters}</strong></div>
      <div><small>Interactions</small><strong>${interactables}</strong></div>
      <div><small>CPU threads</small><strong>${cores}</strong></div>
      <div><small>Device memory</small><strong>${deviceMemory}</strong></div>
      <div><small>Schema</small><strong>v${project?.schemaVersion || '?'}</strong></div>
    </div>
    <div class="section-title">Most used</div>
    <div class="monitor-list">${top.length ? top.map(([type, total]) => `<div><span>${type}</span><strong>${total}</strong></div>`).join('') : '<div><span>No objects yet</span><strong>—</strong></div>'}</div>
    <div class="section-title">Nuitool advice</div>
    <div class="logic-card">
      ${count < 120
        ? '✓ You still have plenty of room to experiment. Nuitool will later replace raw counts with GPU, texture, navigation and memory diagnostics.'
        : '⚠ Start watching repeated objects, shadows and high-detail imported models. Asset Doctor and automatic instancing are planned next.'}
    </div>
    <button class="wide-btn" data-monitor-export>⇩ Export health snapshot</button>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-monitor-close]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-monitor-export]')?.addEventListener('click', () => {
    downloadJSON('nuitool-health.json', {
      generatedAt: new Date().toISOString(),
      project: project?.meta?.name || 'Untitled',
      objects: count,
      characters,
      interactables,
      topTypes: Object.fromEntries(top),
      device: { hardwareConcurrency: navigator.hardwareConcurrency || null, deviceMemory: navigator.deviceMemory || null }
    });
    toast('Health report exported');
  });
}

function enhanceAddPanel() {
  const grid = panel?.querySelector('.asset-grid');
  if (!grid || panel.querySelector('[data-asset-tools]')) return;
  const cards = [...grid.querySelectorAll('.asset-card')];
  const categories = ['All', ...new Set(cards.map((card) => card.querySelector('small')?.textContent).filter(Boolean))];
  const tools = document.createElement('div');
  tools.dataset.assetTools = 'true';
  tools.className = 'asset-tools';
  tools.innerHTML = `
    <input class="asset-search" data-asset-search placeholder="Search assets…" inputmode="search" />
    <div class="category-chips">${categories.map((category, i) => `<button class="category-chip ${i === 0 ? 'active' : ''}" data-category="${category}">${category}</button>`).join('')}</div>
  `;
  grid.before(tools);
  let category = 'All';
  let query = '';
  const apply = () => {
    for (const card of cards) {
      const cardCategory = card.querySelector('small')?.textContent || '';
      const text = card.textContent.toLowerCase();
      const visible = (category === 'All' || cardCategory === category) && (!query || text.includes(query));
      card.classList.toggle('hidden', !visible);
    }
  };
  tools.querySelector('[data-asset-search]')?.addEventListener('input', (event) => { query = event.target.value.trim().toLowerCase(); apply(); });
  tools.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
    category = button.dataset.category;
    tools.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip === button));
    apply();
  }));
}

function enhanceProjectMenu() {
  const sheet = panel?.querySelector('.menu-sheet');
  if (!sheet || sheet.querySelector('[data-import-project]')) return;

  const templateButton = document.createElement('button');
  templateButton.dataset.newTemplate = 'true';
  templateButton.textContent = '✦ New Game from Template';
  templateButton.addEventListener('click', openTemplatePicker);
  sheet.insertBefore(templateButton, sheet.firstChild || null);

  const importButton = document.createElement('button');
  importButton.dataset.importProject = 'true';
  importButton.textContent = '⇧ Import project JSON';
  importButton.addEventListener('click', importProjectFile);
  sheet.insertBefore(importButton, templateButton.nextSibling);

  const snapshotButton = document.createElement('button');
  snapshotButton.textContent = '📸 Save Project Snapshot';
  snapshotButton.addEventListener('click', createSnapshot);
  sheet.appendChild(snapshotButton);

  const restoreButton = document.createElement('button');
  restoreButton.textContent = '↩ Restore Project Snapshot';
  restoreButton.addEventListener('click', restoreSnapshot);
  sheet.appendChild(restoreButton);

  if (installPrompt) {
    const installButton = document.createElement('button');
    installButton.textContent = '＋ Install Nuitool on this device';
    installButton.addEventListener('click', async () => {
      await installPrompt.prompt();
      installPrompt = null;
      installButton.remove();
    });
    sheet.appendChild(installButton);
  }
}

const observer = new MutationObserver(() => {
  enhanceAddPanel();
  enhanceProjectMenu();
});
if (panel) observer.observe(panel, { childList: true, subtree: true });

healthPill?.addEventListener('click', openMonitor);
healthPill?.setAttribute('role', 'button');
healthPill?.setAttribute('tabindex', '0');
healthPill?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openMonitor(); });

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  enhanceProjectMenu();
});
