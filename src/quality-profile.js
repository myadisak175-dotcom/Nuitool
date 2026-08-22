export const QUALITY_PRESETS = Object.freeze({
  eco: Object.freeze({ id: 'eco', label: 'Eco', maxPixelRatio: 1, shadows: false, shadowResolution: 512, shadowDistance: 18 }),
  balanced: Object.freeze({ id: 'balanced', label: 'Balanced', maxPixelRatio: 1.5, shadows: true, shadowResolution: 1024, shadowDistance: 30 }),
  high: Object.freeze({ id: 'high', label: 'High', maxPixelRatio: 2, shadows: true, shadowResolution: 1536, shadowDistance: 42 })
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function fallbackQualityFromSignals({ deviceMemory, hardwareConcurrency, pixelCount } = {}) {
  const memory = finite(deviceMemory, 4);
  const cores = finite(hardwareConcurrency, 4);
  const pixels = finite(pixelCount, 1920 * 1080);
  if (memory <= 3 || cores <= 4 || pixels > 4_500_000) return 'eco';
  if (memory >= 8 && cores >= 8 && pixels <= 4_000_000) return 'high';
  return 'balanced';
}

export function qualityFromGpuResult(gpuResult, signals = {}) {
  const fallback = fallbackQualityFromSignals(signals);
  const tier = finite(gpuResult?.tier, -1);
  const type = String(gpuResult?.type || '');
  if (tier < 0 || type === 'SSR' || type === 'BENCHMARK_FETCH_FAILED') return fallback;
  if (tier <= 1) return 'eco';
  if (tier === 2) return 'balanced';
  if (tier >= 3) {
    const memory = finite(signals.deviceMemory, 8);
    const cores = finite(signals.hardwareConcurrency, 8);
    return memory <= 4 || cores <= 4 ? 'balanced' : 'high';
  }
  return fallback;
}

export function downgradeQuality(current) {
  if (current === 'high') return 'balanced';
  if (current === 'balanced') return 'eco';
  return 'eco';
}

export function calibrateAutoQuality(initial, averageFps) {
  const fps = finite(averageFps, 60);
  if (initial === 'high' && fps < 48) return 'balanced';
  if ((initial === 'balanced' || initial === 'high') && fps < 34) return 'eco';
  return initial;
}

export function resolvePreset(id) {
  return QUALITY_PRESETS[id] || QUALITY_PRESETS.balanced;
}
