import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Radio,
  FileCheck,
  Lock,
  Volume2,
  Info,
  RotateCw,
} from 'lucide-react';
import { enrollSample, getSpeakerProfile } from '../services/api';
import { startWavRecording, type WavRecorderSession } from '../lib/wavRecorder';

interface SampleState {
  status: 'idle' | 'recording' | 'recorded' | 'enrolling' | 'done' | 'error';
  duration?: number;
  quality?: number;
  error?: string;
}

const ENROLLMENT_PHRASES = [
  'My voice is my password and identity.',
  'VoxShield protects my digital identity.',
  'Authorize access to my secure system now.',
];

function SampleCard({
  index,
  state,
  onRecord,
  onStop,
  isRecording,
  waveData,
}: {
  index: number;
  state: SampleState;
  onRecord: () => void;
  onStop: () => void;
  isRecording: boolean;
  waveData: number[];
}) {
  const done = state.status === 'done';
  const error = state.status === 'error';
  const recording = state.status === 'recording';

  return (
    <div
      className={`p-6 rounded-2xl border transition-all ${
        done
          ? 'bg-emerald-50/40 border-emerald-200'
          : error
          ? 'bg-red-50/40 border-red-200'
          : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs ${
              done
                ? 'bg-emerald-600 text-white'
                : error
                ? 'bg-red-600 text-white'
                : 'bg-blue-50 text-[#0B3B82] border border-blue-200'
            }`}
          >
            {done ? '✓' : error ? '✗' : index}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Sample Phrase {index}</div>
            <div className="text-[11px] text-slate-500">
              {done
                ? `Embedded • ${state.duration}ms duration • Authenticity: ${((state.quality || 0) * 100).toFixed(0)}%`
                : error
                ? state.error
                : recording
                ? 'Recording... speak phrase clearly'
                : state.status === 'enrolling'
                ? 'Synthesizing acoustic embeddings...'
                : 'Ready to capture'}
            </div>
          </div>
        </div>
        {done && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
            ENROLLED
          </span>
        )}
      </div>

      {/* Phrase Box */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 italic mb-4">
        "{ENROLLMENT_PHRASES[index - 1]}"
      </div>

      {/* Waveform Visualization during Recording */}
      {recording && (
        <div className="h-10 bg-slate-100 rounded-xl p-2 flex items-center justify-center gap-1 mb-4 overflow-hidden">
          {waveData.slice(0, 40).map((v, i) => (
            <div
              key={i}
              className="w-1 bg-[#155EAD] rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(4, v * 32)}px`,
                opacity: Math.max(0.4, v),
              }}
            />
          ))}
        </div>
      )}

      {/* Button Controls */}
      {!done && state.status !== 'enrolling' && (
        <div>
          {!recording ? (
            <button
              type="button"
              onClick={onRecord}
              disabled={isRecording && !recording}
              className="w-full py-2.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Mic className="w-3.5 h-3.5" />
              Record Sample {index}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 animate-pulse"
            >
              <MicOff className="w-3.5 h-3.5" />
              Stop Recording
            </button>
          )}
        </div>
      )}

      {state.status === 'enrolling' && (
        <div className="py-2.5 text-center text-xs font-bold text-[#0B3B82] flex items-center justify-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-[#0B3B82] border-t-transparent rounded-full animate-spin" />
          Processing acoustic embedding...
        </div>
      )}
    </div>
  );
}

export default function VoiceEnrollment() {
  const [samples, setSamples] = useState<SampleState[]>([
    { status: 'idle' },
    { status: 'idle' },
    { status: 'idle' },
  ]);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [waveData, setWaveData] = useState<number[]>(new Array(40).fill(0.1));
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const wavSessionRef = useRef<WavRecorderSession | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    getSpeakerProfile()
      .then((p) => setProfile(p))
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, []);

  const updateSample = (index: number, patch: Partial<SampleState>) => {
    setSamples((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const startRecording = useCallback(async (index: number) => {
    try {
      const session = await startWavRecording(`voice_sample_${index + 1}.wav`, 40);
      wavSessionRef.current = session;

      const animate = () => {
        if (wavSessionRef.current) {
          setWaveData(wavSessionRef.current.getWaveData());
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animate();

      updateSample(index, { status: 'recording' });
      setRecordingIndex(index);
    } catch (e) {
      updateSample(index, { status: 'error', error: 'Microphone access denied' });
    }
  }, []);

  const stopRecording = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    setWaveData(new Array(40).fill(0.1));

    if (!wavSessionRef.current || recordingIndex === null) return;
    const session = wavSessionRef.current;
    const index = recordingIndex;
    wavSessionRef.current = null;
    setRecordingIndex(null);

    updateSample(index, { status: 'enrolling' });

    try {
      const { blob, durationMs } = await session.stop();
      const res = await enrollSample(blob, index + 1);
      updateSample(index, {
        status: 'done',
        duration: res.duration_ms || durationMs,
        quality: res.quality?.authenticity,
      });
      getSpeakerProfile().then(setProfile).catch(() => {});
    } catch (e: any) {
      updateSample(index, { status: 'error', error: e.message || 'Enrollment failed' });
    }
  }, [recordingIndex]);

  const enrolledCount = samples.filter((s) => s.status === 'done').length;
  const enrollmentComplete = enrolledCount >= 3;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
          <span>/</span>
          <span className="text-slate-800">Biometric Profile Enrollment</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
          Voice Biometrics Enrollment
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Record 3 calibrated voice samples to establish your zero-trust 1:N acoustic profile.
        </p>
      </div>

      {/* Step Indicator Progress (Section 26 Requirements) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Step 1</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">Microphone Access</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Step 2</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">Speak Phrases</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Step 3</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">Vector Synthesis</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Step 4</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">Profile Activated</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-slate-700">Acoustic Samples Required</span>
          <span className="text-[#0B3B82]">{enrolledCount} / 3 Completed</span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-[#0B3B82] h-full transition-all duration-500 rounded-full"
            style={{ width: `${(enrolledCount / 3) * 100}%` }}
          />
        </div>

        {enrollmentComplete && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Voice enrollment complete! Your 1:N acoustic profile is active for speaker verification.</span>
          </div>
        )}
      </div>

      {/* Active Voice Profile Status Card */}
      {!loadingProfile && profile?.has_profile && (
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-900 block">Active Voice Profile</span>
              <span className="text-[11px] text-emerald-700">
                {profile.profile.samples_count} acoustic samples synthesized • Status: {profile.profile.enrollment_complete ? 'Active' : 'Pending'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSamples([{ status: 'idle' }, { status: 'idle' }, { status: 'idle' }]);
              }}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Re-Record Samples
            </button>
            <span className="px-2.5 py-1 rounded-full bg-white text-emerald-800 text-[10px] font-bold border border-emerald-200">
              16kHz PCM Biometrics
            </span>
          </div>
        </div>
      )}

      {/* Sample Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {samples.map((state, i) => (
          <SampleCard
            key={i}
            index={i + 1}
            state={state}
            onRecord={() => startRecording(i)}
            onStop={stopRecording}
            isRecording={recordingIndex !== null}
            waveData={recordingIndex === i ? waveData : new Array(40).fill(0.1)}
          />
        ))}
      </div>

      {/* Instructions Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-[#0B3B82]" />
          Enrollment Guidelines
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="font-bold text-slate-800 block mb-1">Microphone Consistency</span>
            Use the same headset or laptop microphone that you will use for voice commands.
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="font-bold text-slate-800 block mb-1">Low Noise Background</span>
            Record in a quiet workspace to minimize background room reverberations.
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="font-bold text-slate-800 block mb-1">Natural Cadence</span>
            Speak clearly and at your normal pace for at least 2 to 3 seconds per phrase.
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-slate-700 flex items-start gap-2">
          <Lock className="w-4 h-4 text-[#0B3B82] shrink-0 mt-0.5" />
          <span>
            <strong>Biometric Privacy Notice:</strong> VoxShield processes speech strictly to extract 512-dimensional acoustic vectors. Raw audio is never permanently stored on cloud databases.
          </span>
        </div>
      </div>

    </div>
  );
}
