import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterProject } from '../src/project.js';
import { analyzeProjectHealth } from '../src/project-health.js';

test('Project Doctor reports starter project as healthy', () => {
  const report = analyzeProjectHealth(createStarterProject(), []);
  assert.equal(report.status, 'good');
  assert.equal(report.metrics.missingImported, 0);
  assert.equal(report.metrics.objects, 7);
});

test('Project Doctor catches imported model missing on this device', () => {
  const project = createStarterProject();
  project.entities.push({
    id: 'custom', type: 'user-model:abc', name: 'Custom',
    position: [0, 0, 0], rotationY: 0, scale: 1, behavior: 'stay', interaction: null
  });
  const report = analyzeProjectHealth(project, []);
  assert.equal(report.status, 'bad');
  assert.equal(report.metrics.missingImported, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'missing-local-assets'));
});

test('Project Doctor carries Asset Doctor heavy status into project health', () => {
  const project = createStarterProject();
  project.entities.push({
    id: 'custom', type: 'user-model:heavy-1', name: 'Big Castle',
    position: [0, 0, 0], rotationY: 0, scale: 1, behavior: 'stay', interaction: null
  });
  const models = [{ id: 'heavy-1', name: 'Big Castle', size: 18 * 1024 * 1024, doctor: { status: 'heavy' } }];
  const report = analyzeProjectHealth(project, models);
  assert.equal(report.status, 'bad');
  assert.ok(report.issues.some((issue) => issue.code === 'heavy-imported-asset'));
});

test('Project Doctor warns when a scene grows beyond the early mobile budget', () => {
  const project = createStarterProject();
  for (let i = 0; i < 180; i++) {
    project.entities.push({
      id: `prop-${i}`, type: 'crate', name: 'Crate',
      position: [i % 20, 0, Math.floor(i / 20)], rotationY: 0, scale: 1, behavior: 'stay', interaction: null
    });
  }
  const report = analyzeProjectHealth(project, []);
  assert.equal(report.status, 'warn');
  assert.ok(report.issues.some((issue) => issue.code === 'many-objects'));
});
