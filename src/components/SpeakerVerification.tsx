import { motion } from 'framer-motion';
import type { RecognitionResult } from '../types';

interface Props {
  recognition: RecognitionResult;
}

const stateStyles: Record<RecognitionResult['speakerState'], string> = {
  NO_PROFILE: 'border-slate-200 text-slate-500 bg-slate-50',
  MATCH: 'border-emerald-200 text-emerald-800 bg-emerald-50 font-bold',
  INCONCLUSIVE: 'border-amber-200 text-amber-800 bg-amber-50 font-bold',
  MISMATCH: 'border-red-200 text-red-700 bg-red-50 font-bold',
};

const barColor = (sim: number) => (sim < 0.65 ? 'bg-red-600' : sim < 0.85 ? 'bg-amber-500' : 'bg-emerald-600');

export function SpeakerVerification({ recognition }: Props) {
  const { similarity, speakerState } = recognition;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">
          Speaker Similarity <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">cosine similarity</span>
        </span>
        <span className="font-mono text-xs font-bold text-slate-900">{similarity !== null ? similarity.toFixed(3) : '—'}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3.5 border border-slate-200">
        <motion.div
          className={`h-full rounded-full ${similarity !== null ? barColor(similarity) : ''}`}
          animate={{ width: `${Math.max(0, Math.min(100, (similarity ?? 0) * 100))}%` }}
          transition={{ duration: 0.18 }}
        />
      </div>

      <span className={`inline-block font-mono text-[11px] px-2.5 py-1 rounded-full border ${stateStyles[speakerState]}`}>
        SPEAKER: {speakerState.replace('_', ' ')}
      </span>
    </div>
  );
}
