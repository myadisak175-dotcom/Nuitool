const IMPORT_PREFIX = 'user-model:';

function importedId(type) {
  const value = String(type || '');
  return value.startsWith(IMPORT_PREFIX) ? value.slice(IMPORT_PREFIX.length) : null;
}

export function analyzeProjectHealth(project, localModels = []) {
  const entities = Array.isArray(project?.entities) ? project.entities : [];
  const rules = Array.isArray(project?.rules) ? project.rules : [];
  const records = Array.isArray(localModels) ? localModels : [];
  const recordById = new Map(records.map((record) => [String(record.id), record]));
  const usage = new Map();
  const missing = [];
  const issues = [];

  let characters = 0;
  let wanderers = 0;
  let importedPlaced = 0;

  for (const entity of entities) {
    if (entity.type === 'npc' || entity.type === 'slime') characters += 1;
    if (entity.behavior === 'wander' || entity.behavior === 'follow') wanderers += 1;
    const id = importedId(entity.type);
    if (!id) continue;
    importedPlaced += 1;
    usage.set(id, (usage.get(id) || 0) + 1);
    if (!recordById.has(id)) missing.push(entity);
  }

  const usedRecords = [...usage.entries()]
    .map(([id, count]) => ({ record: recordById.get(id), count }))
    .filter((item) => item.record);

  const usedLocalBytes = usedRecords.reduce((sum, item) => sum + Number(item.record.size || 0), 0);
  const libraryBytes = records.reduce((sum, record) => sum + Number(record.size || 0), 0);

  if (missing.length) {
    issues.push({
      level: 'bad',
      code: 'missing-local-assets',
      title: `${missing.length} imported object${missing.length > 1 ? 's' : ''} missing on this device`,
      detail: 'Project references a My 3D model whose GLB bytes are not stored on this device.',
      entityIds: missing.map((entity) => entity.id)
    });
  }

  for (const { record, count } of usedRecords) {
    const status = record.doctor?.status;
    if (status === 'heavy') {
      issues.push({
        level: 'bad',
        code: 'heavy-imported-asset',
        title: `${record.name || 'Imported model'} is Heavy${count > 1 ? ` ×${count}` : ''}`,
        detail: count > 1
          ? 'A heavy model is placed more than once. Geometry may be shared, but each visible instance still adds rendering work.'
          : 'Asset Doctor marked this model as heavy for mobile. Watch load time and frame rate during Playtest.',
        assetId: record.id
      });
    } else if (status === 'check') {
      issues.push({
        level: 'warn',
        code: 'check-imported-asset',
        title: `${record.name || 'Imported model'} needs a check`,
        detail: `Placed ${count} time${count === 1 ? '' : 's'}. Review its Asset Doctor report and Playtest performance.`,
        assetId: record.id
      });
    }
  }

  if (entities.length > 350) {
    issues.push({ level: 'bad', code: 'many-objects', title: `${entities.length} objects in this scene`, detail: 'This prototype is beyond the comfortable mobile scene budget. Split/stream the world or reduce repeated objects.' });
  } else if (entities.length > 180) {
    issues.push({ level: 'warn', code: 'many-objects', title: `${entities.length} objects in this scene`, detail: 'Start testing on a mid-range phone before adding more scene content.' });
  }

  if (wanderers > 35) {
    issues.push({ level: 'bad', code: 'many-active-characters', title: `${wanderers} moving characters`, detail: 'Many always-active character behaviors can become expensive on mobile. Later Nuitool will sleep distant actors automatically.' });
  } else if (wanderers > 20) {
    issues.push({ level: 'warn', code: 'many-active-characters', title: `${wanderers} moving characters`, detail: 'Keep an eye on Playtest hitches when all characters are active at once.' });
  }

  if (rules.length > 120) {
    issues.push({ level: 'bad', code: 'many-rules', title: `${rules.length} game rules`, detail: 'The game logic is getting large for a flat rule list. Grouping/behavior packs should be used before adding much more.' });
  } else if (rules.length > 80) {
    issues.push({ level: 'warn', code: 'many-rules', title: `${rules.length} game rules`, detail: 'Logic is growing. Consider reusable behaviors instead of duplicating similar rules.' });
  }

  if (usedLocalBytes > 40 * 1024 * 1024) {
    issues.push({ level: 'warn', code: 'large-local-set', title: 'Large set of imported models in use', detail: 'The unique local GLBs referenced by this scene exceed 40 MB before runtime compression/cache effects.' });
  }

  const bad = issues.filter((issue) => issue.level === 'bad').length;
  const warn = issues.filter((issue) => issue.level === 'warn').length;
  const status = bad ? 'bad' : warn ? 'warn' : 'good';
  const label = status === 'good' ? 'Healthy' : status === 'warn' ? 'Check' : 'Needs attention';
  const icon = status === 'good' ? '🟢' : status === 'warn' ? '🟠' : '🔴';

  return {
    status,
    label,
    icon,
    issues,
    metrics: {
      objects: entities.length,
      rules: rules.length,
      characters,
      activeCharacters: wanderers,
      importedPlaced,
      uniqueImportedUsed: usage.size,
      missingImported: missing.length,
      usedLocalBytes,
      libraryBytes
    }
  };
}
