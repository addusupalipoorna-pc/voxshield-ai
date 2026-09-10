import type { LiveMetrics } from '../types';

interface Props {
  metrics: LiveMetrics | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-200 pb-1.5 font-mono text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-semibold">{value}</span>
    </div>
  );
}

export function AudioMetrics({ metrics }: Props) {
  const noiseLabel = !metrics
    ? '—'
    : metrics.rms < 0.01
      ? 'near-silent'
      : metrics.rms < 0.03
        ? 'low'
        : 'active';

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-4">
      <Row label="RMS Energy" value={metrics ? metrics.rms.toFixed(4) : '—'} />
      <Row label="Zero-Crossing Rate" value={metrics ? metrics.zcr.toFixed(4) : '—'} />
      <Row label="Spectral Centroid" value={metrics ? `${metrics.centroid.toFixed(0)} Hz` : '—'} />
      <Row label="Spectral Rolloff (85%)" value={metrics ? `${metrics.rolloff.toFixed(0)} Hz` : '—'} />
      <Row label="Spectral Flatness" value={metrics ? metrics.flatness.toFixed(4) : '—'} />
      <Row
        label="Estimated Pitch (F0)"
        value={metrics ? (metrics.pitch > 0 ? `${metrics.pitch.toFixed(1)} Hz` : '— (silent/unvoiced)') : '—'}
      />
      <Row label="Sample Rate" value={metrics ? `${metrics.sampleRate} Hz` : '—'} />
      <Row label="Noise Floor (est.)" value={noiseLabel} />
    </div>
  );
}
