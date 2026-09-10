import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles, RefreshCw, AlertTriangle, KeyRound } from 'lucide-react';
import type { AnalystState } from '../hooks/useAIAnalyst';

interface Props {
  state: AnalystState;
  text: string;
  error: string | null;
  isLive: boolean;
  hasMetrics: boolean;
  onAnalyze: () => void;
  onClear: () => void;
}

function StatusBadge({ state }: { state: AnalystState }) {
  if (state === 'LOADING') {
    return (
      <span className="flex items-center gap-1.5 text-[#0B3B82] font-mono text-[11px] font-bold">
        <span className="inline-block w-2 h-2 rounded-full bg-[#155EAD] animate-ping" />
        ANALYZING
      </span>
    );
  }
  if (state === 'DONE') {
    return (
      <span className="font-mono text-[11px] text-emerald-700 font-bold">
        ANALYSIS COMPLETE
      </span>
    );
  }
  if (state === 'ERROR') {
    return (
      <span className="flex items-center gap-1 font-mono text-[11px] text-red-700 font-bold">
        <AlertTriangle size={11} />
        ERROR
      </span>
    );
  }
  return null;
}

export function AIAnalyst({ state, text, error, isLive, hasMetrics, onAnalyze, onClear }: Props) {
  const canAnalyze = isLive && hasMetrics && state !== 'LOADING' && state !== 'NO_KEY';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[#0B3B82]" strokeWidth={1.8} />
          <h2 className="text-[13px] font-bold text-slate-900">AI Voice Analyst</h2>
        </div>
        <StatusBadge state={state} />
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Send the current voice metrics snapshot to <span className="font-mono text-amber-700 font-semibold">gpt-6-astra</span> for expert interpretation
      </p>

      {/* No API key */}
      {state === 'NO_KEY' && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-[12.5px] text-amber-900">
          <KeyRound size={14} className="mt-0.5 shrink-0 text-amber-700" />
          <span>
            No API key found. Set <span className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200">VITE_EXPLABS_API_KEY</span> in{' '}
            <span className="font-mono">.env</span> and restart the dev server.
          </span>
        </div>
      )}

      {/* Idle / prompt */}
      {(state === 'IDLE' || state === 'ERROR') && (
        <div className="space-y-3">
          {state === 'ERROR' && error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-[12px] text-red-700 font-mono break-all">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <button
            id="ai-analyst-analyze-btn"
            onClick={onAnalyze}
            disabled={!canAnalyze}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200
              ${canAnalyze
                ? 'bg-[#0B3B82] hover:bg-[#082F6B] text-white shadow-xs'
                : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
          >
            <Sparkles size={14} />
            {!isLive
              ? 'Start microphone to enable analysis'
              : !hasMetrics
                ? 'Waiting for audio signal…'
                : 'Analyze Current Voice Signal'}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {state === 'LOADING' && (
        <div className="space-y-2.5 py-1">
          {[85, 70, 55, 40].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded-full bg-slate-200 animate-pulse"
              style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      )}

      {/* Response text */}
      <AnimatePresence>
        {state === 'DONE' && text && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className="text-[13px] text-slate-800 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 whitespace-pre-wrap">
              {text}
            </div>
            <button
              id="ai-analyst-clear-btn"
              onClick={onClear}
              className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800 transition-colors font-medium"
            >
              <RefreshCw size={12} />
              Clear / Analyze again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-slate-400 mt-3.5 leading-relaxed">
        The AI receives acoustic feature values only — no audio bytes are transmitted. Analysis is
        performed by the <span className="font-mono text-slate-600">gpt-6-astra</span> model via the Experiential Gateway.
      </p>
    </div>
  );
}
