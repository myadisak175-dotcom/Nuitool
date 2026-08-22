import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateAutoQuality, fallbackQualityFromSignals, qualityFromGpuResult, resolvePreset } from '../src/quality-profile.js';

test('fallback chooses Eco for constrained devices', () => {
  assert.equal(fallbackQualityFromSignals({ deviceMemory: 3, hardwareConcurrency: 8, pixelCount: 2_000_000 }), 'eco');
  assert.equal(fallbackQualityFromSignals({ deviceMemory: 8, hardwareConcurrency: 4, pixelCount: 2_000_000 }), 'eco');
});

test('fallback chooses High only for strong signals and practical screen size', () => {
  assert.equal(fallbackQualityFromSignals({ deviceMemory: 8, hardwareConcurrency: 8, pixelCount: 3_000_000 }), 'high');
  assert.equal(fallbackQualityFromSignals({ deviceMemory: 8, hardwareConcurrency: 8, pixelCount: 6_000_000 }), 'balanced');
});

test('GPU tier maps to quality but weak device signals can cap tier 3', () => {
  assert.equal(qualityFromGpuResult({ tier: 1, type: 'BENCHMARK' }, { deviceMemory: 8, hardwareConcurrency: 8 }), 'eco');
  assert.equal(qualityFromGpuResult({ tier: 2, type: 'BENCHMARK' }, { deviceMemory: 8, hardwareConcurrency: 8 }), 'balanced');
  assert.equal(qualityFromGpuResult({ tier: 3, type: 'BENCHMARK' }, { deviceMemory: 8, hardwareConcurrency: 8 }), 'high');
  assert.equal(qualityFromGpuResult({ tier: 3, type: 'BENCHMARK' }, { deviceMemory: 4, hardwareConcurrency: 8 }), 'balanced');
});

test('benchmark fetch failure falls back to local device signals', () => {
  assert.equal(qualityFromGpuResult({ tier: 0, type: 'BENCHMARK_FETCH_FAILED' }, { deviceMemory: 8, hardwareConcurrency: 8, pixelCount: 3_000_000 }), 'high');
});

test('live calibration only downgrades quality when FPS misses target', () => {
  assert.equal(calibrateAutoQuality('high', 60), 'high');
  assert.equal(calibrateAutoQuality('high', 44), 'balanced');
  assert.equal(calibrateAutoQuality('balanced', 30), 'eco');
  assert.equal(calibrateAutoQuality('eco', 20), 'eco');
});

test('quality presets expose bounded mobile pixel ratios', () => {
  assert.equal(resolvePreset('eco').maxPixelRatio, 1);
  assert.equal(resolvePreset('balanced').maxPixelRatio, 1.5);
  assert.equal(resolvePreset('high').maxPixelRatio, 2);
});
