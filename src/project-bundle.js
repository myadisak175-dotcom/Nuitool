import { collectImportedAssetIds, createBundleArchive, MAX_IMPORT_BYTES, readBundleArchive } from './project-bundle-core.js';
import { getImportedModel, restoreImportedModel } from './imported-assets.js';

const PROJECT_STORAGE_KEY = 'nuitool.project.v0.1';
const BACKUP_STORAGE_KEY = 'nuitool.bundle.backup.v1';
const panel = document.querySelector('#panel');
const toast = document.querySelector('#toast');
let busy = false;

function notify(message, duration = 2600) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    if (toast.textContent === message) toast.classList.add('hidden');
  }, duration);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function downloadName(project) {
  const base = String(project?.meta?.name || 'nuitool-project')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 80) || 'nuitool-project';
  return `${base}.nuitool`;
}

async function exportBundle() {
  if (busy) return;
  const project = window.Nuitool?.getProject?.();
  if (!project) return notify('Project ยังไม่พร้อมสำหรับ export');
  busy = true;
  notify('กำลังเตรียม Portable Project…', 8000);
  try {
    const ids = collectImportedAssetIds(project);
    const records = [];
    for (const id of ids) {
      const record = await getImportedModel(id);
      if (!record?.blob) throw new Error(`My 3D asset ${id} is missing on this device.`);
      records.push({
        id: record.id,
        name: record.name,
        filename: record.filename,
        createdAt: record.createdAt,
        bytes: new Uint8Array(await record.blob.arrayBuffer())
      });
    }
    const bytes = createBundleArchive(project, records);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName(project);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify(`📦 Portable Project พร้อมแล้ว · ${(blob.size / 1024 / 1024).toFixed(1)} MB`, 3200);
  } catch (error) {
    notify(`Export ไม่สำเร็จ: ${error?.message || error}`, 5200);
  } finally {
    busy = false;
  }
}

function showImportPreview(file, bundle) {
  document.querySelector('#bundle-import-overlay')?.remove();
  const overlay = document.createElement('section');
  overlay.id = 'bundle-import-overlay';
  overlay.className = 'bundle-import-overlay';
  const projectName = bundle.project?.meta?.name || 'Imported Game';
  overlay.innerHTML = `
    <div class="bundle-import-card">
      <div class="panel-head"><div><h2>Open Nuitool Project</h2><p>${escapeHtml(file.name)}</p></div><button class="close-btn" data-bundle-close>×</button></div>
      <div class="bundle-preview-hero"><span>📦</span><div><strong>${escapeHtml(projectName)}</strong><small>Portable project bundle</small></div></div>
      <div class="bundle-preview-metrics">
        <div><small>Objects</small><strong>${bundle.project.entities?.length || 0}</strong></div>
        <div><small>Rules</small><strong>${bundle.project.rules?.length || 0}</strong></div>
        <div><small>My 3D</small><strong>${bundle.assets.length}</strong></div>
        <div><small>File</small><strong>${(file.size / 1024 / 1024).toFixed(1)} MB</strong></div>
      </div>
      <div class="bundle-warning">โปรเจกต์ปัจจุบันจะถูกแทนที่ แต่ Nuitool จะเก็บ backup JSON ล่าสุดไว้ในเครื่องก่อนเปิดไฟล์นี้</div>
      <button class="wide-btn accent" data-bundle-open>เปิดโปรเจกต์นี้</button>
      <button class="wide-btn" data-bundle-cancel>ยกเลิก</button>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('[data-bundle-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-bundle-cancel]')?.addEventListener('click', close);
  overlay.querySelector('[data-bundle-open]')?.addEventListener('click', async (event) => {
    if (busy) return;
    busy = true;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'กำลังคืน Project + My 3D…';
    try {
      const current = window.Nuitool?.getProject?.();
      if (current) localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), project: current }));
      for (const asset of bundle.assets) {
        await restoreImportedModel({
          id: asset.id,
          name: asset.name,
          filename: asset.filename,
          createdAt: asset.createdAt,
          bytes: asset.bytes
        });
      }
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(bundle.project));
      notify('✓ เปิด Portable Project แล้ว', 1200);
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = 'ลองเปิดอีกครั้ง';
      notify(`เปิด Project ไม่สำเร็จ: ${error?.message || error}`, 5200);
      busy = false;
    }
  });
}

function chooseBundle() {
  if (busy) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.nuitool,.zip,application/zip';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return notify('ไฟล์นี้ใหญ่เกิน 100 MB สำหรับ mobile import', 4200);
    busy = true;
    notify('กำลังตรวจ Portable Project…', 7000);
    try {
      const bundle = readBundleArchive(new Uint8Array(await file.arrayBuffer()));
      showImportPreview(file, bundle);
      notify(`✓ พบ ${bundle.project?.meta?.name || 'Nuitool Project'}`, 1600);
    } catch (error) {
      notify(`เปิดไฟล์ไม่ได้: ${error?.message || error}`, 5200);
    } finally {
      busy = false;
    }
  }, { once: true });
  input.click();
}

function injectBundleTools() {
  const menu = panel?.querySelector('.menu-sheet');
  if (!menu || menu.querySelector('[data-export-bundle]')) return;
  const exportButton = document.createElement('button');
  exportButton.dataset.exportBundle = 'true';
  exportButton.innerHTML = '📦 Export portable .nuitool';
  exportButton.addEventListener('click', exportBundle);

  const importButton = document.createElement('button');
  importButton.dataset.importBundle = 'true';
  importButton.innerHTML = '📥 Open .nuitool project';
  importButton.addEventListener('click', chooseBundle);

  const first = menu.firstElementChild;
  if (first) {
    menu.insertBefore(importButton, first);
    menu.insertBefore(exportButton, importButton);
  } else {
    menu.append(exportButton, importButton);
  }
}

const observer = new MutationObserver(injectBundleTools);
if (panel) observer.observe(panel, { childList: true, subtree: true });
