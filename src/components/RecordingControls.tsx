import { Mic, Square } from 'lucide-react';
import type { MicState } from '../types';

interface Props {
  micState: MicState;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingControls({ micState, onStart, onStop }: Props) {
  const isLive = micState === 'LIVE';
  const isRequesting = micState === 'REQUESTING';

  return (
    <div className="flex gap-2.5 mt-4 flex-wrap">
      <button
        onClick={onStart}
        disabled={isLive || isRequesting}
        className="flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-md bg-vs-primary text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-vs-primary-hover transition-all"
      >
        <Mic size={15} />
        {isRequesting ? 'Requesting…' : 'Start Microphone'}
      </button>
      <button
        onClick={onStop}
        disabled={!isLive}
        className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-md border border-vs-line bg-white text-vs-danger hover:bg-red-50 hover:border-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        <Square size={14} />
        Stop
      </button>
    </div>
  );
}
