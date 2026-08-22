import { checkImportedModel, deleteImportedModel, importGlbFile, initializeImportedAssets, listImportedModels } from './imported-assets.js';

const panel = document.querySelector('#panel');
const addButton = document.querySelector('[data-panel="add"]');
const toast = document.querySelector('#toast');
let importing = false;

function notify(message, duration = 2200) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    if (toast.textContent === message) toast.classList.add('hidden');
  }, duration);
}

function currentProject() {
  return window.Nuitool?.getProject?.() || null;
}

function refreshAddPanelAndSelect(type = null) {
  if (!panel || !addButton) return;
  panel.querySelector('[data-close]')?.click();
  setTimeout(() => {
    addButton.click();
    if (!type) return;
    setTimeout(() => {
      const card = [...panel.querySelectorAll('[data-asset]')].find((item) => item.dataset.asset === type);
      card?.click();
    }, 50);
  }, 30);
}

function prettySize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function doctorBadge(doctor) {
  if (!doctor) return '<span class="doctor-badge neutral">⚪ Not checked</span>';
  return `<span class="doctor-badge ${doctor.status}">${doctor.icon} ${escapeHtml(doctor.label)}</span>`;
}

function openDoctorReport(type, record, options = {}) {
  document.querySelector('#asset-doctor-overlay')?.remove();
  const doctor = record?.doctor;
  const metrics = doctor?.metrics || {};
  const overlay = document.createElement('section');
  overlay.id = 'asset-doctor-overlay';
  overlay.className = 'local-assets-overlay';
  overlay.innerHTML = `
    <div class="local-assets-card doctor-card">
      <div class="panel-head"><div><h2>Asset Doctor</h2><p>${escapeHtml(record?.name || '3D model')}</p></div><button class="close-btn" data-doctor-close>×</button></div>
      <div class="doctor-hero ${doctor?.status || 'neutral'}">
        <span>${doctor?.icon || '⚪'}</span>
        <div><strong>${escapeHtml(doctor?.label || 'Not checked')}</strong><small>${prettySize(record?.size || 0)} · GLB ${metrics.glbVersion || '?'}</small></div>
      </div>
      <div class="doctor-metrics">
        <div><small>Triangles</small><strong>${Number(metrics.triangles || 0).toLocaleString()}</strong></div>
        <div><small>Meshes</small><strong>${metrics.meshes ?? '—'}</strong></div>
        <div><small>Materials</small><strong>${metrics.materials ?? '—'}</strong></div>
        <div><small>Textures</small><strong>${Math.max(metrics.images || 0, metrics.textures || 0)}</strong></div>
        <div><small>Animations</small><strong>${metrics.animations ?? '—'}</strong></div>
        <div><small>Skins</small><strong>${metrics.skins ?? '—'}</strong></div>
      </div>
      <div class="section-title">What Nuitool found</div>
      <div class="doctor-list">${(doctor?.issues || ['ยังไม่มีผลการตรวจ']).map((text) => `<div>• ${escapeHtml(text)}</div>`).join('')}</div>
      <div class="section-title">Suggestion</div>
      <div class="doctor-list tips">${(doctor?.tips || ['ลองตรวจ asset อีกครั้ง']).map((text) => `<div>→ ${escapeHtml(text)}</div>`).join('')}</div>
      ${metrics.generator ? `<div class="local-assets-note">Created with: ${escapeHtml(metrics.generator)}</div>` : ''}
      <div class="doctor-actions">
        ${options.place !== false ? '<button class="wide-btn accent" data-doctor-place>วางในโลก</button>' : ''}
        <button class="wide-btn" data-doctor-keep>${options.place !== false ? 'เก็บไว้ก่อน' : 'ปิด'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-doctor-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-doctor-keep]')?.addEventListener('click', close);
  overlay.querySelector('[data-doctor-place]')?.addEventListener('click', () => {
    close();
    refreshAddPanelAndSelect(type);
  });
}

async function chooseGlb() {
  if (importing) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,model/gltf-binary';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    importing = true;
    notify(`Asset Doctor กำลังตรวจ ${file.name}…`, 6000);
    try {
      const { type, record } = await importGlbFile(file);
      notify(`${record.doctor?.icon || '🧩'} ${record.name} ตรวจเสร็จแล้ว`, 1600);
      openDoctorReport(type, record, { place: true });
    } catch (error) {
      notify(`Import ไม่สำเร็จ: ${error?.message || error}`, 4800);
    } finally {
      importing = false;
    }
  }, { once: true });
  input.click();
}

async function openManager() {
  document.querySelector('#local-assets-overlay')?.remove();
  const records = await listImportedModels();
  const project = currentProject();
  const overlay = document.createElement('section');
  overlay.id = 'local-assets-overlay';
  overlay.className = 'local-assets-overlay';
  overlay.innerHTML = `
    <div class="local-assets-card">
      <div class="panel-head"><div><h2>My 3D</h2><p>โมเดลที่เก็บอยู่บนอุปกรณ์นี้</p></div><button class="close-btn" data-local-close>×</button></div>
      <div class="local-assets-list">
        ${records.length ? records.map((record) => {
          const type = `user-model:${record.id}`;
          const used = project?.entities?.filter((entity) => entity.type === type).length || 0;
          return `<div class="local-asset-row doctor-row">
            <div class="local-asset-main"><strong>🧩 ${escapeHtml(record.name)}</strong><small>${prettySize(record.size)} · ${used ? `${used} placed` : 'not placed'}</small>${doctorBadge(record.doctor)}</div>
            <div class="local-asset-actions">
              <button data-check-local="${record.id}" data-type="${type}">${record.doctor ? 'Report' : 'Check'}</button>
              <button class="delete" data-delete-local="${record.id}" ${used ? 'disabled' : ''}>Delete</button>
            </div>
          </div>`;
        }).join('') : '<div class="playtest-empty">ยังไม่มี GLB ที่ import</div>'}
      </div>
      <div class="local-assets-note">My 3D ยังเก็บไฟล์ไว้ในเครื่องนี้เท่านั้น — Project JSON อย่างเดียวยังไม่พก GLB ไปเครื่องอื่น</div>
      <button class="wide-btn accent" data-local-import>＋ Import another GLB</button>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-local-close]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-local-import]')?.addEventListener('click', () => {
    overlay.remove();
    chooseGlb();
  });
  overlay.querySelectorAll('[data-check-local]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.checkLocal;
    const existing = records.find((record) => record.id === id);
    try {
      const record = existing?.doctor ? existing : await checkImportedModel(id);
      openDoctorReport(button.dataset.type, record, { place: false });
    } catch (error) {
      notify(`ตรวจไม่ได้: ${error?.message || error}`, 3600);
    }
  }));
  overlay.querySelectorAll('[data-delete-local]').forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return;
    await deleteImportedModel(button.dataset.deleteLocal);
    notify('ลบ local asset แล้ว');
    overlay.remove();
    openManager();
    refreshAddPanelAndSelect();
  }));
}

async function injectImportTools() {
  const grid = panel?.querySelector('.asset-grid');
  if (!grid || panel.querySelector('[data-imported-asset-tools]')) return;
  const records = await listImportedModels();
  if (!grid.isConnected || panel.querySelector('[data-imported-asset-tools]')) return;

  const tools = document.createElement('div');
  tools.dataset.importedAssetTools = 'true';
  tools.className = 'imported-asset-tools';
  tools.innerHTML = `
    <button class="import-glb-button" data-import-glb><span>🩺</span><div><strong>Import 3D</strong><small>Asset Doctor checks GLB first</small></div><b>＋</b></button>
    ${records.length ? `<button class="manage-local-button" data-manage-local>My 3D · ${records.length}</button>` : ''}`;

  const existingSearch = panel.querySelector('.asset-tools');
  if (existingSearch) existingSearch.before(tools);
  else grid.before(tools);
  tools.querySelector('[data-import-glb]')?.addEventListener('click', chooseGlb);
  tools.querySelector('[data-manage-local]')?.addEventListener('click', openManager);
}

window.addEventListener('nuitool:asset-load-error', (event) => {
  notify(`⚠ ${event.detail?.name || 'Model'}: ${event.detail?.message || 'load failed'}`, 4500);
});
window.addEventListener('nuitool:asset-loaded', (event) => {
  notify(`✓ ${event.detail?.name || '3D model'} loaded`, 1500);
});
window.addEventListener('nuitool:asset-library-change', () => setTimeout(injectImportTools, 0));

const observer = new MutationObserver(injectImportTools);
if (panel) observer.observe(panel, { childList: true, subtree: true });

initializeImportedAssets()
  .then(() => injectImportTools())
  .catch(() => notify('Local 3D storage is unavailable in this browser.', 3200));
