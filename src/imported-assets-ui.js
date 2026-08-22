import { deleteImportedModel, importGlbFile, initializeImportedAssets, listImportedModels } from './imported-assets.js';

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
    }, 40);
  }, 30);
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
    notify(`กำลังเก็บ ${file.name} ไว้ในเครื่อง…`, 5000);
    try {
      const { type, record } = await importGlbFile(file);
      notify(`🧩 ${record.name} พร้อมวางแล้ว`);
      refreshAddPanelAndSelect(type);
    } catch (error) {
      notify(`Import ไม่สำเร็จ: ${error?.message || error}`, 4200);
    } finally {
      importing = false;
    }
  }, { once: true });
  input.click();
}

function prettySize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
      <div class="panel-head"><div><h2>My 3D</h2><p>ไฟล์ GLB ที่เก็บอยู่บนอุปกรณ์นี้</p></div><button class="close-btn" data-local-close>×</button></div>
      <div class="local-assets-list">
        ${records.length ? records.map((record) => {
          const type = `user-model:${record.id}`;
          const used = project?.entities?.filter((entity) => entity.type === type).length || 0;
          return `<div class="local-asset-row">
            <div><strong>🧩 ${escapeHtml(record.name)}</strong><small>${prettySize(record.size)} · ${used ? `${used} placed` : 'not placed'}</small></div>
            <button data-delete-local="${record.id}" ${used ? 'disabled' : ''}>Delete</button>
          </div>`;
        }).join('') : '<div class="playtest-empty">ยังไม่มี GLB ที่ import</div>'}
      </div>
      <div class="local-assets-note">ไฟล์ใน My 3D ยังเป็น local asset — Project JSON อย่างเดียวยังไม่พกโมเดลไปเครื่องอื่น</div>
      <button class="wide-btn accent" data-local-import>＋ Import another GLB</button>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-local-close]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-local-import]')?.addEventListener('click', () => {
    overlay.remove();
    chooseGlb();
  });
  overlay.querySelectorAll('[data-delete-local]').forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return;
    await deleteImportedModel(button.dataset.deleteLocal);
    notify('ลบ local asset แล้ว');
    overlay.remove();
    openManager();
    refreshAddPanelAndSelect();
  }));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    <button class="import-glb-button" data-import-glb><span>🧩</span><div><strong>Import 3D</strong><small>GLB · saved on this device</small></div><b>＋</b></button>
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
