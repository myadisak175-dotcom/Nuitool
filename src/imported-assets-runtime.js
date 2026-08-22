import * as pc from 'playcanvas';
import { createImportedModelEntity, isImportedType } from './imported-assets.js';

const loading = new WeakSet();
const reportedMissing = new Set();

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function findRuntimeView(app, entityId) {
  const stack = [...app.root.children];
  while (stack.length) {
    const entity = stack.pop();
    if (entity?.nuitoolId === entityId) return entity;
    if (entity?.children?.length) stack.push(...entity.children);
  }
  return null;
}

async function hydrateView(app, descriptor, view) {
  if (!view || view.nuitoolImportedReady || loading.has(view)) return;
  loading.add(view);
  view.nuitoolImportedType = descriptor.type;
  try {
    const imported = await createImportedModelEntity(app, descriptor.type, descriptor.name);
    const currentProject = window.Nuitool?.getProject?.();
    const stillExists = currentProject?.entities?.some((item) => item.id === descriptor.id && item.type === descriptor.type);
    if (!view.parent || !stillExists) {
      imported.destroy();
      return;
    }
    for (const child of [...view.children]) child.destroy();
    view.addChild(imported);
    view.nuitoolImportedReady = true;
    view.nuitoolImportedError = null;
    emit('nuitool:asset-loaded', { type: descriptor.type, name: descriptor.name, entityId: descriptor.id });
  } catch (error) {
    const message = String(error?.message || error || 'Could not load imported model.');
    view.nuitoolImportedError = message;
    const key = `${descriptor.id}:${message}`;
    if (!reportedMissing.has(key)) {
      reportedMissing.add(key);
      emit('nuitool:asset-load-error', { type: descriptor.type, name: descriptor.name, entityId: descriptor.id, message });
    }
  }
}

function scan() {
  const app = pc.Application.getApplication?.();
  const project = window.Nuitool?.getProject?.();
  if (!app || !project?.entities) return;
  for (const descriptor of project.entities) {
    if (!isImportedType(descriptor.type)) continue;
    const view = findRuntimeView(app, descriptor.id);
    if (view) hydrateView(app, descriptor, view);
  }
}

window.addEventListener('nuitool:asset-library-change', () => setTimeout(scan, 0));
window.addEventListener('focus', scan);
setInterval(scan, 450);
setTimeout(scan, 0);
