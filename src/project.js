const STORAGE_KEY = 'nuitool.project.v0.1';

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'entity') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function validateProject(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Project must be an object.' };
  if (input.schemaVersion !== 1) return { ok: false, error: 'Unsupported Project Schema version.' };
  if (!input.world || typeof input.world !== 'object') return { ok: false, error: 'World data is missing.' };
  if (!Array.isArray(input.entities)) return { ok: false, error: 'Entities list is missing.' };
  if (input.entities.length > 1000) return { ok: false, error: 'This v0.x prototype limits projects to 1,000 entities.' };

  const seen = new Set();
  const normalized = {
    schemaVersion: 1,
    meta: {
      name: String(input.meta?.name || 'Imported Game').slice(0, 80),
      createdAt: input.meta?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    world: {
      ground: ['meadow', 'dirt', 'sand', 'stone'].includes(input.world.ground) ? input.world.ground : 'meadow',
      sky: ['day', 'sunset', 'night'].includes(input.world.sky) ? input.world.sky : 'day'
    },
    entities: []
  };

  for (const raw of input.entities) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'An entity is invalid.' };
    const id = String(raw.id || '').trim();
    const type = String(raw.type || '').trim();
    if (!id || !type) return { ok: false, error: 'Every entity needs an id and type.' };
    if (seen.has(id)) return { ok: false, error: `Duplicate entity id: ${id}` };
    seen.add(id);
    const p = Array.isArray(raw.position) ? raw.position : [0, 0, 0];
    normalized.entities.push({
      id,
      type,
      name: String(raw.name || type).slice(0, 80),
      position: [finiteNumber(p[0]), finiteNumber(p[1]), finiteNumber(p[2])],
      rotationY: finiteNumber(raw.rotationY),
      scale: Math.min(8, Math.max(0.1, finiteNumber(raw.scale, 1))),
      behavior: String(raw.behavior || (type === 'player' ? 'player' : 'stay')),
      interaction: raw.interaction && typeof raw.interaction === 'object'
        ? {
            type: String(raw.interaction.type || ''),
            text: String(raw.interaction.text || '').slice(0, 240)
          }
        : null
    });
  }

  if (!normalized.entities.some((entity) => entity.id === 'player' && entity.type === 'player')) {
    normalized.entities.unshift({
      id: 'player', type: 'player', name: 'Player', position: [0, 0, 4], rotationY: 180,
      scale: 1, behavior: 'player', interaction: null
    });
  }

  return { ok: true, project: normalized };
}

export function createStarterProject() {
  return {
    schemaVersion: 1,
    meta: {
      name: 'My First Game',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    world: {
      ground: 'meadow',
      sky: 'day'
    },
    entities: [
      {
        id: 'player',
        type: 'player',
        name: 'Player',
        position: [0, 0, 4],
        rotationY: 180,
        scale: 1,
        behavior: 'player',
        interaction: null
      },
      {
        id: 'starter-house',
        type: 'house',
        name: 'Village House',
        position: [-4.5, 0, -3.5],
        rotationY: 18,
        scale: 1,
        behavior: 'stay',
        interaction: null
      },
      {
        id: 'starter-tree-a',
        type: 'tree',
        name: 'Round Tree',
        position: [4.2, 0, -3.3],
        rotationY: -20,
        scale: 1,
        behavior: 'stay',
        interaction: null
      },
      {
        id: 'starter-tree-b',
        type: 'pine',
        name: 'Pine',
        position: [7.2, 0, 0.6],
        rotationY: 12,
        scale: 0.9,
        behavior: 'stay',
        interaction: null
      },
      {
        id: 'starter-npc',
        type: 'npc',
        name: 'Mia',
        position: [3.2, 0, 1.1],
        rotationY: -95,
        scale: 1,
        behavior: 'wander',
        interaction: { type: 'talk', text: 'สวัสดี! ฉันชื่อ Mia 🌱' }
      },
      {
        id: 'starter-flowers',
        type: 'flowers',
        name: 'Flowers',
        position: [-1.8, 0, -1.6],
        rotationY: 0,
        scale: 1.15,
        behavior: 'stay',
        interaction: null
      },
      {
        id: 'starter-coin',
        type: 'coin',
        name: 'Coin',
        position: [0.9, 0, -2.4],
        rotationY: 0,
        scale: 1,
        behavior: 'spin',
        interaction: { type: 'collect', text: 'เก็บเหรียญแล้ว +1' }
      }
    ]
  };
}

export class ProjectStore {
  constructor() {
    this.listeners = new Set();
    this.history = [];
    this.future = [];
    this.project = this.load() || createStarterProject();
    this.save();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const result = validateProject(parsed);
      return result.ok ? result.project : null;
    } catch {
      return null;
    }
  }

  save() {
    this.project.meta.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project)); } catch { /* quota/privacy mode */ }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(reason = 'change') {
    this.save();
    for (const listener of this.listeners) listener(this.project, reason);
  }

  checkpoint() {
    this.history.push(clone(this.project));
    if (this.history.length > 40) this.history.shift();
    this.future.length = 0;
  }

  undo() {
    if (!this.history.length) return false;
    this.future.push(clone(this.project));
    this.project = this.history.pop();
    this.notify('undo');
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.history.push(clone(this.project));
    this.project = this.future.pop();
    this.notify('redo');
    return true;
  }

  setWorld(patch) {
    this.checkpoint();
    Object.assign(this.project.world, patch);
    this.notify('world');
  }

  setProjectName(name) {
    this.checkpoint();
    this.project.meta.name = String(name || 'Untitled Game').trim().slice(0, 80) || 'Untitled Game';
    this.notify('meta');
  }

  addEntity(type, name, position = [0, 0, 0]) {
    this.checkpoint();
    const entity = {
      id: uid(type),
      type,
      name: name || type,
      position: [...position],
      rotationY: 0,
      scale: 1,
      behavior: type === 'npc' || type === 'slime' ? 'stay' : type === 'coin' ? 'spin' : 'stay',
      interaction: type === 'npc' ? { type: 'talk', text: 'สวัสดี!' } : type === 'coin' ? { type: 'collect', text: 'เก็บแล้ว!' } : null
    };
    this.project.entities.push(entity);
    this.notify('add');
    return entity;
  }

  getEntity(id) {
    return this.project.entities.find((entity) => entity.id === id) || null;
  }

  updateEntity(id, patch, options = {}) {
    const entity = this.getEntity(id);
    if (!entity) return null;
    if (options.checkpoint !== false) this.checkpoint();
    Object.assign(entity, patch);
    this.notify('entity');
    return entity;
  }

  removeEntity(id) {
    if (id === 'player') return false;
    const index = this.project.entities.findIndex((entity) => entity.id === id);
    if (index < 0) return false;
    this.checkpoint();
    this.project.entities.splice(index, 1);
    this.notify('remove');
    return true;
  }

  duplicateEntity(id) {
    const source = this.getEntity(id);
    if (!source || source.id === 'player') return null;
    this.checkpoint();
    const copy = clone(source);
    copy.id = uid(source.type);
    copy.name = `${source.name} copy`;
    copy.position[0] += 1.2;
    copy.position[2] += 1.2;
    this.project.entities.push(copy);
    this.notify('duplicate');
    return copy;
  }

  importJSON(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      const result = validateProject(parsed);
      if (!result.ok) return result;
      this.checkpoint();
      this.project = result.project;
      this.notify('import');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not parse project JSON.' };
    }
  }

  reset() {
    this.checkpoint();
    this.project = createStarterProject();
    this.notify('reset');
  }

  exportJSON() {
    return JSON.stringify(this.project, null, 2);
  }
}
