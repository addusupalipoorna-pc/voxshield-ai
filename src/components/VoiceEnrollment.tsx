import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { EnrollmentStatus, MicState } from '../types';

interface Props {
  enrollment: EnrollmentStatus;
  micState: MicState;
  onRecord: () => void;
  onReset: () => void;
}

export function VoiceEnrollment({ enrollment, micState, onRecord, onReset }: Props) {
  const isLive = micState === 'LIVE';
  const canRecord = isLive && !enrollment.isRecording && !enrollment.voiceprintReady;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h2 className="text-[13px] font-bold text-slate-900 mb-1">Voiceprint Enrollment</h2>
      <p className="text-xs text-slate-500 mb-4">
        Record 3 short samples (~2.5s each) to build a reference feature vector
      </p>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => {
          const filled = i < enrollment.samplesCaptured;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ scale: filled ? [1, 1.08, 1] : 1 }}
              transition={{ duration: 0.3 }}
              className={`flex-1 h-[36px] rounded-xl border flex items-center justify-center font-mono text-[11px] font-bold ${
                filled
                  ? 'border-emerald-200 text-emerald-800 bg-emerald-50 shadow-xs'
                  : 'border-slate-200 text-slate-400 bg-slate-50'
              }`}
            >
              {filled ? <Check size={14} className="text-emerald-700" /> : i + 1}
            </motion.div>
          );
        })}
      </div>

      <div className="flex gap-2.5 mt-4 flex-wrap">
        <button
          onClick={onRecord}
          disabled={!canRecord}
          className="text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[#0B3B82] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#0B3B82] transition-colors shadow-xs"
        >
          {enrollment.isRecording ? 'Recording…' : 'Record Sample'}
        </button>
        <button
          onClick={onReset}
          disabled={enrollment.samplesCaptured === 0}
          className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:border-red-300 hover:text-red-700 hover:bg-red-50 transition-colors"
        >
          Clear Voiceprint
        </button>
      </div>

      <p className="text-[11.5px] text-slate-400 mt-3.5 leading-relaxed">{enrollment.message}</p>
    </div>
  );
}
