/**
 * audioFeatures.ts
 *
 * All functions here operate on real data pulled from a Web Audio
 * AnalyserNode (time-domain + frequency-domain arrays). Nothing in this
 * file generates or randomizes values — every number returned is derived
 * from the actual audio samples passed in.
 */

export interface SpectralStats {
  centroid: number; // Hz
  rolloff: number; // Hz, 85% energy point
  flatness: number; // 0-1, geometric/arithmetic mean of magnitude spectrum
  sumMag: number;
}

export interface RawFeatures {
  rms: number;
  zcr: number;
  centroid: number;
  rolloff: number;
  flatness: number;
  pitch: number; // Hz, 0 if unvoiced/silent
}

export interface FeatureVector {
  vec: number[];
  raw: RawFeatures;
}

export function computeRMS(timeData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
  return Math.sqrt(sum / timeData.length);
}

export function computeZCR(timeData: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < timeData.length; i++) {
    if (timeData[i - 1] >= 0 !== timeData[i] >= 0) crossings++;
  }
  return crossings / timeData.length;
}

export function computeSpectralStats(freqData: Uint8Array, sampleRate: number): SpectralStats {
  const n = freqData.length;
  const nyquist = sampleRate / 2;
  let sumMag = 0;
  let sumWeighted = 0;
  for (let i = 0; i < n; i++) {
    const mag = freqData[i];
    const freq = (i / n) * nyquist;
    sumMag += mag;
    sumWeighted += mag * freq;
  }
  const centroid = sumMag > 0 ? sumWeighted / sumMag : 0;

  const target = sumMag * 0.85;
  let cum = 0;
  let rolloff = 0;
  for (let i = 0; i < n; i++) {
    cum += freqData[i];
    if (cum >= target) {
      rolloff = (i / n) * nyquist;
      break;
    }
  }

  let logSum = 0;
  let linSum = 0;
  for (let i = 0; i < n; i++) {
    const m = freqData[i] + 1; // avoid log(0)
    logSum += Math.log(m);
    linSum += m;
  }
  const geoMean = Math.exp(logSum / n);
  const arMean = linSum / n;
  const flatness = arMean > 0 ? geoMean / arMean : 0;

  return { centroid, rolloff, flatness, sumMag };
}

/** Autocorrelation-based F0 (pitch) estimate on time-domain samples. */
export function estimatePitch(timeData: Float32Array, sampleRate: number): number {
  const size = timeData.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += timeData[i] * timeData[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return 0; // too quiet to estimate reliably

  const thresh = 0.2;
  let r1 = 0;
  let r2 = size - 1;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(timeData[i]) < thresh) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(timeData[size - i]) < thresh) {
      r2 = size - i;
      break;
    }
  }
  const trimmed = timeData.slice(r1, r2);
  const n = trimmed.length;
  if (n < 2) return 0;

  const c = new Array(n).fill(0);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return 0;
  const freq = sampleRate / maxPos;
  if (freq < 60 || freq > 500) return 0; // outside plausible human voice F0 range
  return freq;
}

/** Coarse log-spaced spectral energy bands, used as a lightweight stand-in for MFCC shape. */
export function melBins(freqData: Uint8Array, bands: number): number[] {
  const n = freqData.length;
  const out = new Array(bands).fill(0);
  const maxIdx = Math.floor(n * 0.5);
  for (let b = 0; b < bands; b++) {
    const lo = Math.floor(Math.pow(maxIdx, b / bands));
    const hi = Math.floor(Math.pow(maxIdx, (b + 1) / bands));
    let sum = 0;
    let cnt = 0;
    for (let i = Math.max(1, lo); i < Math.min(n, Math.max(hi, lo + 1)); i++) {
      sum += freqData[i];
      cnt++;
    }
    out[b] = cnt > 0 ? sum / cnt / 255 : 0;
  }
  return out;
}

export function buildFeatureVector(
  timeData: Float32Array,
  freqData: Uint8Array,
  sampleRate: number,
): FeatureVector {
  const rms = computeRMS(timeData);
  const zcr = computeZCR(timeData);
  const spec = computeSpectralStats(freqData, sampleRate);
  const pitch = estimatePitch(timeData, sampleRate);
  const bins = melBins(freqData, 12);

  const vec = [
    Math.min(rms * 4, 1),
    zcr,
    Math.min(spec.centroid / 4000, 1),
    Math.min(spec.rolloff / 6000, 1),
    spec.flatness,
    Math.min(pitch / 400, 1),
    ...bins,
  ];

  return {
    vec,
    raw: { rms, zcr, centroid: spec.centroid, rolloff: spec.rolloff, flatness: spec.flatness, pitch },
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function averageVectors(vectors: number[][]): number[] {
  const dims = vectors[0].length;
  const out = new Array(dims).fill(0);
  vectors.forEach((v) => {
    for (let i = 0; i < dims; i++) out[i] += v[i];
  });
  for (let i = 0; i < dims; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Heuristic "naturalness" estimate from pitch stability + spectral flatness.
 * This is explicitly NOT a trained deepfake/anti-spoofing classifier — it is a
 * signal-processing heuristic used only until a real model (Phase 6) is wired in.
 */
export function heuristicAuthenticity(raw: RawFeatures): number | null {
  if (raw.pitch <= 0) return null; // no voiced signal to judge
  const flatnessScore = 1 - Math.min(raw.flatness * 6, 1);
  return Math.max(0, Math.min(1, flatnessScore));
}
