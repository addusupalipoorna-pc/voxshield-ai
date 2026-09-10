import { motion, AnimatePresence } from 'framer-motion';
import { AUTH_CAUTION_THRESHOLD } from '../types';
import type { RecognitionResult, SecurityDecisionState } from '../types';

interface Props {
  recognition: RecognitionResult;
}

function computeDecision(recognition: RecognitionResult): { state: SecurityDecisionState; text: string } {
  const { speakerState, authenticity } = recognition;
  if (speakerState === 'NO_PROFILE') {
    return { state: 'IDLE', text: 'AWAITING VOICEPRINT + LIVE INPUT' };
  }
  if (speakerState === 'MISMATCH') {
    return { state: 'BLOCK', text: '✕ BLOCK — speaker mismatch' };
  }
  if (speakerState === 'MATCH' && authenticity !== null && authenticity >= AUTH_CAUTION_THRESHOLD) {
    return { state: 'ALLOW', text: '✓ ALLOW (local demo heuristic — not a security determination)' };
  }
  return { state: 'CAUTION', text: '⚠ SECONDARY VERIFICATION — inconclusive signal' };
}

const styles: Record<SecurityDecisionState, string> = {
  IDLE: 'border-slate-200 text-slate-500 bg-slate-50',
  ALLOW: 'border-emerald-200 text-emerald-800 bg-emerald-50 font-bold',
  CAUTION: 'border-amber-200 text-amber-800 bg-amber-50 font-bold',
  BLOCK: 'border-red-200 text-red-700 bg-red-50 font-bold',
};

export function SecurityDecision({ recognition }: Props) {
  const { state, text } = computeDecision(recognition);

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={`mt-4 px-4 py-3.5 rounded-xl border font-mono text-[13px] text-center tracking-wide shadow-xs ${styles[state]}`}
        >
          {text}
        </motion.div>
      </AnimatePresence>
      <p className="text-[11.5px] text-slate-400 mt-3.5 leading-relaxed">
        Demo thresholds, not calibrated security standards: similarity ≥ 0.85 → MATCH, 0.65–0.85 →
        INCONCLUSIVE, below 0.65 → MISMATCH. This banner reflects the local heuristic pipeline only.
      </p>
    </div>
  );
}
