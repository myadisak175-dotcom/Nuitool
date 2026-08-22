import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterProject, validateProject, ProjectStore } from '../src/project.js';

function installMemoryStorage() {
  const memory = new Map();
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
    clear() { memory.clear(); }
  };
  return memory;
}

test('starter project validates and contains rule-native interactions', () => {
  const project = createStarterProject();
  const result = validateProject(project);
  assert.equal(result.ok, true);
  assert.ok(result.project.rules.length >= 2);
  assert.ok(result.project.rules.some((rule) => rule.targetId === 'starter-npc' && rule.action.type === 'message'));
  assert.ok(result.project.rules.some((rule) => rule.targetId === 'starter-coin' && rule.action.type === 'collect'));
});

test('legacy entity interaction migrates into a rule on validation', () => {
  const project = createStarterProject();
  project.rules = [];
  const npc = project.entities.find((entity) => entity.id === 'starter-npc');
  npc.interaction = { type: 'talk', text: 'ข้อความเก่า' };

  const result = validateProject(project);
  assert.equal(result.ok, true);
  const rule = result.project.rules.find((item) => item.targetId === npc.id);
  assert.ok(rule);
  assert.equal(rule.when.type, 'player_near');
  assert.equal(rule.action.type, 'message');
  assert.equal(rule.action.text, 'ข้อความเก่า');
  assert.equal(result.project.entities.find((entity) => entity.id === npc.id).interaction, null);
});

test('duplicate entity ids are rejected', () => {
  const project = createStarterProject();
  project.entities.push({ ...project.entities[1] });
  const result = validateProject(project);
  assert.equal(result.ok, false);
  assert.match(result.error, /Duplicate entity id/);
});

test('new NPC and Coin are created with rules instead of legacy interactions', () => {
  installMemoryStorage();
  const store = new ProjectStore();
  const npc = store.addEntity('npc', 'Guide', [2, 0, 2]);
  const coin = store.addEntity('coin', 'Gold', [3, 0, 3]);

  assert.equal(npc.interaction, null);
  assert.equal(coin.interaction, null);
  assert.ok(store.getRulesForEntity(npc.id).some((rule) => rule.when.type === 'player_near' && rule.action.type === 'message'));
  assert.ok(store.getRulesForEntity(coin.id).some((rule) => rule.when.type === 'player_touch' && rule.action.type === 'collect'));
});

test('duplicating an object duplicates its attached rules with new ids', () => {
  installMemoryStorage();
  const store = new ProjectStore();
  const source = store.addEntity('npc', 'Guide', [1, 0, 1]);
  const sourceRules = store.getRulesForEntity(source.id);
  assert.ok(sourceRules.length > 0);

  const copy = store.duplicateEntity(source.id);
  const copyRules = store.getRulesForEntity(copy.id);
  assert.equal(copyRules.length, sourceRules.length);
  assert.notEqual(copyRules[0].id, sourceRules[0].id);
  assert.equal(copyRules[0].action.type, sourceRules[0].action.type);
});

test('removing an object removes rules that target it', () => {
  installMemoryStorage();
  const store = new ProjectStore();
  const object = store.addEntity('npc', 'Temporary', [0, 0, 0]);
  assert.ok(store.getRulesForEntity(object.id).length > 0);
  assert.equal(store.removeEntity(object.id), true);
  assert.equal(store.getRulesForEntity(object.id).length, 0);
});
