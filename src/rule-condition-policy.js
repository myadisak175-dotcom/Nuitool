export const WORLD_SKIES = Object.freeze(['day', 'sunset', 'night']);

export function normalizeRuleCondition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type !== 'world_sky') return null;
  const value = WORLD_SKIES.includes(raw.value) ? raw.value : null;
  return value ? { type: 'world_sky', value } : null;
}

export function ruleConditionMatches(condition, context = {}) {
  const normalized = normalizeRuleCondition(condition);
  if (!normalized) return true;
  if (normalized.type === 'world_sky') return String(context.sky || '') === normalized.value;
  return true;
}

export function conditionLabel(condition) {
  const normalized = normalizeRuleCondition(condition);
  if (!normalized) return 'Always';
  if (normalized.type === 'world_sky') {
    if (normalized.value === 'day') return 'World is Day';
    if (normalized.value === 'sunset') return 'World is Sunset';
    if (normalized.value === 'night') return 'World is Night';
  }
  return 'Always';
}
