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

function normalizeRule(raw, entityIds) {
  if (!raw || typeof raw !== 'object') return null;
  const targetId = String(raw.targetId || raw.when?.entityId || '').trim();
  if (!targetId || !entityIds.has(targetId)) return null;
  const whenType = ['player_near', 'player_touch'].includes(raw.when?.type) ? raw.when.type : 'player_near';
  const actionType = ['message', 'collect'].includes(raw.action?.type) ? raw.action.type : 'message';
  const defaultDistance = whenType === 'player_touch' ? 1.25 : 2.35;
  return {
    id: String(raw.id || uid('rule')).slice(0, 100),
    name: String(raw.name || 'Game rule').slice(0, 80),
    enabled: raw.enabled !== false,
    targetId,
    when: {
      type: whenType,
      distance: Math.min(8, Math.max(0.4, finiteNumber(raw.when?.distance, defaultDistance)))
    },
    action: {
      type: actionType,
      text: String(raw.action?.text || (actionType === 'collect' ? 'Collected!' : 'Hello!')).slice(0, 240)
    }
  };
}

function ruleFromLegacyInteraction(entity) {
  const legacy = entity.interaction;
  if (!legacy?.type) return null;
  const actionType = legacy.type === 'collect' ? 'collect' : 'message';
  const whenType = actionType === 'collect' ? 'player_touch' : 'player_near';
  return {
    id: uid('rule'),
    name: actionType === 'collect' ? `Collect ${entity.name}` : `${entity.name} interaction`,
    enabled: true,
    targetId: entity.id,
    when: { type: whenType, distance: whenType === 'player_touch' ? 1.25 : 2.35 },
    action: { type: actionType, text: String(legacy.text || (actionType === 'collect' ? 'Collected!' : 'Hello!')).slice(0, 240) }
  };
}

export function validateProject(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Project must be an object.' };
  if (input.schemaVersion !== 1) return { ok: false, error: 'Unsupported Project Schema version.' };
  if (!input.world || typeof input.world !== 'object') return { ok: false, error: 'World data is missing.' };
  if (!Array.isArray(input.entities)) return { ok: false, error: 'Entities list is missing.' };
  if (input.entities.length > 1000) return { ok: false, error: 'This v0.x prototype limits projects to 1,000 entities.' };
  if (Array.isArray(input.rules) && input.rules.length > 250) return { ok: false, error: 'This v0.x prototype limits projects to 250 rules.' };

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
    entities: [],
    rules: []
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
        ? { type: String(raw.interaction.type || ''), text: String(raw.interaction.text || '').slice(0, 240) }
        : null
    });
  }

  if (!normalized.entities.some((entity) => entity.id === 'player' && entity.type === 'player')) {
    normalized.entities.unshift({
      id: 'player', type: 'player', name: 'Player', position: [0, 0, 4], rotationY: 180,
      scale: 1, behavior: 'player', interaction: null
    });
    seen.add('player');
  }

  const ruleIds = new Set();
  for (const rawRule of Array.isArray(input.rules) ? input.rules : []) {
    const rule = normalizeRule(rawRule, seen);
    if (!rule) continue;
    if (ruleIds.has(rule.id)) rule.id = uid('rule');
    ruleIds.add(rule.id);
    normalized.rules.push(rule);
  }

  // Compatibility bridge: older Nuitool projects stored simple interactions on entities.
  // Convert those interactions into the rule system once, while preserving Schema v1.
  for (const entity of normalized.entities) {
    const migrated = ruleFromLegacyInteraction(entity);
    if (!migrated) continue;
    const alreadyCovered = normalized.rules.some((rule) =>
      rule.targetId === entity.id && rule.action.type === migrated.action.type
    );
    if (!alreadyCovered && normalized.rules.length < 250) normalized.rules.push(migrated);
    entity.interaction = null;
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
    world: { ground: 'meadow', sky: 'day' },
    entities: [
      { id: 'player', type: 'player', name: 'Player', position: [0, 0, 4], rotationY: 180, scale: 1, behavior: 'player', interaction: null },
      { id: 'starter-house', type: 'house', name: 'Village House', position: [-4.5, 0, -3.5], rotationY: 18, scale: 1, behavior: 'stay', interaction: null },
      { id: 'starter-tree-a', type: 'tree', name: 'Round Tree', position: [4.2, 0, -3.3], rotationY: -20, scale: 1, behavior: 'stay', interaction: null },
      { id: 'starter-tree-b', type: 'pine', name: 'Pine', position: [7.2, 0, 0.6], rotationY: 12, scale: 0.9, behavior: 'stay', interaction: null },
      { id: 'starter-npc', type: 'npc', name: 'Mia', position: [3.2, 0, 1.1], rotationY: -95, scale: 1, behavior: 'wander', interaction: null },
      { id: 'starter-flowers', type: 'flowers', name: 'Flowers', position: [-1.8, 0, -1.6], rotationY: 0, scale: 1.15, behavior: 'stay', interaction: null },
      { id: 'starter-coin', type: 'coin', name: 'Coin', position: [0.9, 0, -2.4], rotationY: 0, scale: 1, behavior: 'spin', interaction: null }
    ],
    rules: [
      {
        id: 'rule-mia-talk', name: 'Mia says hello', enabled: true, targetId: 'starter-npc',
        when: { type: 'player_near', distance: 2.35 },
        action: { type: 'message', text: 'สวัสดี! ฉันชื่อ Mia 🌱' }
      },
      {
        id: 'rule-coin-collect', name: 'Collect coin', enabled: true, targetId: 'starter-coin',
        when: { type: 'player_touch', distance: 1.25 },
        action: { type: 'collect', text: 'เก็บเหรียญแล้ว +1' }
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
    if (!Array.isArray(this.project.rules)) this.project.rules = [];
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
      id: uid(type), type, name: name || type, position: [...position], rotationY: 0, scale: 1,
      behavior: type === 'npc' || type === 'slime' ? 'stay' : type === 'coin' ? 'spin' : 'stay',
      interaction: null
    };
    this.project.entities.push(entity);

    if (type === 'npc') {
      this.project.rules.push({
        id: uid('rule'), name: `${entity.name} says hello`, enabled: true, targetId: entity.id,
        when: { type: 'player_near', distance: 2.35 },
        action: { type: 'message', text: 'สวัสดี!' }
      });
    } else if (type === 'coin') {
      this.project.rules.push({
        id: uid('rule'), name: `Collect ${entity.name}`, enabled: true, targetId: entity.id,
        when: { type: 'player_touch', distance: 1.25 },
        action: { type: 'collect', text: 'เก็บแล้ว!' }
      });
    }

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
    this.project.rules = (this.project.rules || []).filter((rule) => rule.targetId !== id);
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
    for (const rule of this.getRulesForEntity(source.id)) {
      const ruleCopy = clone(rule);
      ruleCopy.id = uid('rule');
      ruleCopy.targetId = copy.id;
      ruleCopy.name = `${rule.name} copy`;
      this.project.rules.push(ruleCopy);
    }
    this.notify('duplicate');
    return copy;
  }

  getRulesForEntity(entityId) {
    return (this.project.rules || []).filter((rule) => rule.targetId === entityId);
  }

  addRule(targetId, config = {}) {
    if (!this.getEntity(targetId)) return null;
    this.checkpoint();
    const whenType = ['player_near', 'player_touch'].includes(config.whenType) ? config.whenType : 'player_near';
    const actionType = ['message', 'collect'].includes(config.actionType) ? config.actionType : 'message';
    const rule = {
      id: uid('rule'),
      name: String(config.name || `${whenType} → ${actionType}`).slice(0, 80),
      enabled: true,
      targetId,
      when: { type: whenType, distance: whenType === 'player_touch' ? 1.25 : 2.35 },
      action: { type: actionType, text: String(config.text || (actionType === 'collect' ? 'Collected!' : 'Hello!')).slice(0, 240) }
    };
    this.project.rules.push(rule);
    this.notify('rule:add');
    return rule;
  }

  updateRule(id, patch = {}) {
    const rule = (this.project.rules || []).find((item) => item.id === id);
    if (!rule) return null;
    this.checkpoint();
    if (typeof patch.enabled === 'boolean') rule.enabled = patch.enabled;
    if (patch.text != null) rule.action.text = String(patch.text).slice(0, 240);
    if (['player_near', 'player_touch'].includes(patch.whenType)) {
      rule.when.type = patch.whenType;
      rule.when.distance = patch.whenType === 'player_touch' ? 1.25 : 2.35;
    }
    if (['message', 'collect'].includes(patch.actionType)) rule.action.type = patch.actionType;
    this.notify('rule:update');
    return rule;
  }

  removeRule(id) {
    const index = (this.project.rules || []).findIndex((rule) => rule.id === id);
    if (index < 0) return false;
    this.checkpoint();
    this.project.rules.splice(index, 1);
    this.notify('rule:remove');
    return true;
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
