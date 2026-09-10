import { motion } from 'framer-motion';
import { AUTH_CAUTION_THRESHOLD, AUTH_WARN_THRESHOLD } from '../types';
import type { RecognitionResult } from '../types';

interface Props {
  authenticity: RecognitionResult['authenticity'];
}

const barColor = (v: number) =>
  v < AUTH_CAUTION_THRESHOLD ? 'bg-red-600' : v < AUTH_WARN_THRESHOLD ? 'bg-amber-500' : 'bg-emerald-600';

export function AuthenticityResult({ authenticity }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">
          Voice Authenticity{' '}
          <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
            heuristic
          </span>
        </span>
        <span className="font-mono text-xs font-bold text-slate-900">
          {authenticity !== null ? `${authenticity.toFixed(3)} (heuristic)` : 'n/a (no voiced signal)'}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <motion.div
          className={`h-full rounded-full ${authenticity !== null ? barColor(authenticity) : ''}`}
          animate={{ width: `${(authenticity ?? 0) * 100}%` }}
          transition={{ duration: 0.18 }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
        Derived from pitch stability and spectral flatness only. This is a{' '}
        <span className="text-slate-700 font-medium">Heuristic Audio Signal Analysis</span>, not a trained anti-spoofing
        model — a real deepfake classifier is not connected in this build (see model status below).
      </p>
    </div>
  );
}
